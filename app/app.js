let express = require('express')
let morgan = require('morgan')
let cookieParser = require('cookie-parser')
let bodyParser = require('body-parser')
let path = require('path')
let routes = require('./routes/routes')
let Server = require('http').Server
let browserify = require('browserify-middleware')
let session = require('express-session')
let MongoStore = require('connect-mongo')(session)
let mongoose = require('mongoose')
let flash = require('connect-flash')
let io = require('socket.io')

require('songbird')

let passportMiddleWare = require('./middlewares/passport')
const NODE_ENV = process.env.NODE_ENV || 'development'
let people = {}
let connectedSockets = {}

class App {

	constructor (config) {
		let app = this.app = express()
		this.port = process.env.PORT || 8000

		app.config = {
			auth: config.auth[NODE_ENV],
			database: config.database[NODE_ENV]
		}

		// configure passport
		passportMiddleWare.configure(config.auth[NODE_ENV])
		app.passport = passportMiddleWare.passport

		// connect database
		mongoose.connect(config.database[NODE_ENV].url)

		// configure other middleware
		app.use(morgan('dev'))
		app.use(cookieParser('canvas-chat-session'))
		app.use(bodyParser.json({limit: '50mb'}))
		app.use(bodyParser.urlencoded({limit: '50mb', extended : true }))

		app.set('views', path.join(__dirname, '..', 'views'))
		app.set('view engine', 'ejs')

		this.sessionMiddleware = session({
			secret: 'canvas-chat-session',
			store: new MongoStore({db:'canvas-chat'}),
			resave: true,
			saveUninitialized: true
		})

		app.use(this.sessionMiddleware)
		
		// Setup passport authentication middleware
		app.use(app.passport.initialize())
		// persistent login sessions
		app.use(app.passport.session())
		// Flash messages stored in session
		app.use(flash())
		
		routes(this.app)

		// browserify client scripts
		browserify.settings({transform: ['babelify']})
        app.use(express.static('public'))

        // TODO find a way to bundle all files together
        // login/main.js
        app.use('/login/main.js', browserify('./public/js/login/main.js'))
        // TODO: profile/main.js
        app.use('/profile/main.js', browserify('./public/js/profile/main.js'))
        app.use('/chat/main.js', browserify('./public/js/chat/main.js'))

        // TODO: chatroom/main.js

		this.server = Server(app)
		this.server = Server(app)
        this.io = io(this.server)
        this.io.use((socket, next) => {
			this.sessionMiddleware(socket.request, socket.request.res, next)
        })
        this.io.on('connection', socket => {
        	console.log('a user connected using socket')
        	socket.on('disconnect', () => {
        		delete connectedSockets[socket.id]
        		delete people[socket.username]
        		console.log('user disconnected')
        	})
        	socket.on('addUser', (facebookId) => {
            	console.log(facebookId, socket.id)
				socket.username = facebookId
				people[socket.username] = socket.id
				connectedSockets[socket.id] = socket
            })

			socket.on('attributes', (response) => {
				let toSocketId = people[response.to]
				if(toSocketId) {
					console.log('server attributes', response)
					connectedSockets[toSocketId].emit('server:attributes', response)
				}				
			})

			socket.on('client:erase-canvas', (update) => {
				let toSocketId = people[update.to]
				if (toSocketId) {
					connectedSockets[toSocketId].emit('server:erase-canvas', update)
				}	
			})

			socket.on('client:image-upload', (update) => {
				console.log('image upload server', update)
				let toSocketId = people[update.to]
				if (toSocketId) {
					connectedSockets[toSocketId].emit('server:image-upload', update)
				}
			})

			socket.on("PATH", (response) => {				
				let toSocketId = people[response.to]
				if(toSocketId) {
					console.log('server PATH', response)
					connectedSockets[toSocketId].emit('server:PATH', response)
				}
			})
			socket.on("MOVE", (response) => {				
				let toSocketId = people[response.to]
				if(toSocketId) {
					console.log('server MOVE', response)
					connectedSockets[toSocketId].emit('server:MOVE', response)
				}
			})				
        })

	}

	async initialize(port) {
		await this.server.promise.listen(port)
		return this
	}
}

module.exports = App