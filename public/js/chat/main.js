let $ = require('jquery')
let _ = require('lodash')
let io = require('socket.io-client')
let ChatUtils = require('./chat-utils')
let socket = io()

let facebookId = $('#fromUserId').attr("data-id")
$(function(){
	if(facebookId) {		
		let $currentSelectedFriend
		let toId
		let canvasForm = document.getElementById('client-canvas')
		let serverCanvas = document.getElementById('server-canvas')

		let ctx = canvasForm.getContext('2d')
		let serverContext = serverCanvas.getContext('2d')

		let imageLoader = document.getElementById('imageLoader');
    	imageLoader.addEventListener('change', handleImage, false);

		function handleImage(e) {
			let reader = new FileReader()
			reader.onload = function(event){
				let img = new Image()
				img.onload = function() {				    
				    ctx.drawImage(img,0,0, 680, 405)
				    let imageUrl = canvasForm.toDataURL()
				    socket.emit('client:image-upload', {
		        		imageUrl : imageUrl,
		        		to : toId
		        	}) 
				}
				img.src = event.target.result;
			}
			reader.readAsDataURL(e.target.files[0]);     
		}

		let clearActive = function($target) {
			$target.find(".js-friend-item").removeClass("teal");
			$target.find(".js-friend-name").removeClass("white-text");
		}

		let setActive = function($target) {
			$target.find(".js-friend-item").addClass("teal");
			$target.find(".js-friend-name").addClass("white-text");
		}

		let getSelectedColor = () => {
			let r = $('#js-red').val()
			let b = $('#js-blue').val()
			let g = $('#js-green').val()
			return `rgb(${r},${g},${b})`
		}

		// DOM Events	
		$(".js-friends-list-item").click(function(e) {
			console.log("clicked")
			let $target = $(e.currentTarget);
			toId = $target.data("id");
			if($currentSelectedFriend) {
				clearActive($currentSelectedFriend);
				// if the same friend is selected again.
				let curDataId = $currentSelectedFriend.data("id");
				if(toId === curDataId) {
					toId = null;
					$currentSelectedFriend = null;
					return;
				}				
			}
			setActive($target)			
			$currentSelectedFriend = $target;				
		})

		$("#js-image-upload").click(() => {
			$("#imageLoader").click()
		})


		$(".js-clear-canvas").click(function(e) {
			e.preventDefault();
			clearCanvas();
			socket.emit('client:erase-canvas', {to : toId})
			Materialize.toast('Canvas cleared', 2000)
		})

		let makeAjaxCall = function(url, data, successMsg, errorMsg, additionalOptions) {
			var opts = _.extend({},{
			 	url:url,
			 	type:"post",
			 	data: data,
			 	success: function(){
					Materialize.toast(successMsg, 2000)
			 	},
			 	error: function(){
					Materialize.toast(errorMsg, 2000)
			 	}
			 },additionalOptions)
			$.ajax(opts);	
		}

		$(".js-save-canvas").click(function(e) {
			e.preventDefault()
			 let dataURL = canvasForm.toDataURL()
			 console.log({foo:dataURL})
			 makeAjaxCall("/save/canvas", {
			 		userId: $("#fromUserId").data("id"),
			 		fromUser: $("#fromUserFbName").data("name"),
  					toUser: $currentSelectedFriend.find(".js-friend-name").data("name"),
  					imgUrl: dataURL
			 	}, 'Canvas successfully saved', 'Error saving canvas');			 
		});

		$(".js-share-canvas").click(function(e) {
			e.preventDefault();			
			let fromId = $("#fromUserId").data("id")
			let token = $("#fromUserFbToken").data("token")
			let blob = ChatUtils.convertBase64ToBlob(canvasForm.toDataURL());
			let fd = ChatUtils.getFormData(blob, token, "My Awesome painting using canvas chat!");		    
			let url = `https://graph.facebook.com/${fromId}/photos?access_token=${token}`			
		    makeAjaxCall(url, fd,
		    	'Canvas successfully shared',
		    	'Error sharing canvas',{
		    		processData:false,
		    		contentType:false
		    	});		    
		})

		// Canvas Events
		let isDrawing	

		let clearCanvas = function(){
			ctx.clearRect(0,0,680,405)
		}

		function getRandomInt(min, max) {
  			return Math.floor(Math.random() * (max - min + 1)) + min;
		}

		let drawOnCanvas = function(inDrawingMode, pos, context) {
			isDrawing = inDrawingMode
			context.beginPath();              
			context.lineWidth = pos.size
			context.strokeStyle = pos.color
			context.lineJoin = context.lineCap = 'round'
			context.shadowBlur = pos.shadowWidth,
			context.shadowColor = pos.color
			context.moveTo(pos.x, pos.y)
			context.stroke()
		}

		let drawOnMove = function(pos, context) {
			if (isDrawing) {
		  		context.lineTo(pos.x, pos.y)
		  		context.stroke()
			}        
		}

		let drawImageOnCanvas = function(imageUri) {
			let image = new Image()
			image.onload = function () {
				console.log('inside onload')
				ctx.drawImage(image,0,0, 680, 405)				
			}
			image.src = imageUri
		}

		canvasForm.onmousedown = function(e) {
			let selectedSize = $('#lineWidth').val()
			let selectedColor = getSelectedColor()
			let shadowWidth = $('#shadowWidth').val()
	        let pos = {
	          x : e.clientX - canvasForm.offsetLeft,
	          y: e.clientY - canvasForm.offsetTop,
	          color: selectedColor,
	          size: selectedSize,
	          shadowWidth : shadowWidth
	        }
	        if(toId){
		        drawOnCanvas(true, pos, ctx)
		        socket.emit('client:mouse-down', {
		        	pos : pos,
		        	to : toId
		        })       
	        }              
	    }

	    canvasForm.onmousemove = function(e) {
	    	if(isDrawing) {
	    	   let selectedSize = $('#lineWidth').val()
	    	   let selectedColor = getSelectedColor()
	    	   let shadowWidth = $('#shadowWidth').val()
		       let pos = {
		          x : e.clientX - canvasForm.offsetLeft,
	          	  y: e.clientY - canvasForm.offsetTop,
	          	  color: selectedColor,
	          	  size: selectedSize,
	          	  shadowWidth : shadowWidth
		        }		       
		       if(toId){
			        drawOnMove(pos, ctx)
			        socket.emit('client:mouse-move', {
			        	pos : pos,
			        	to : toId
			        })
		    	}
	    	}
	    }

	    canvasForm.onmouseup = function() {
	        isDrawing = false
	        socket.emit('client:mouse-up', {
	        	isDrawing : false,
	        	to : toId
	        })
	    }


	    // Socket Events
		socket.on('connect', () => {	
			socket.emit('addUser', facebookId)
		})

		socket.on('server:erase-canvas', function(update){
			clearCanvas();
		})

		socket.on('server:mouse-down', function(pos) {
			drawOnCanvas(true, pos, serverContext)
		})

		socket.on('server:mouse-move', function(pos) {
			drawOnMove(pos, serverContext)
		})

		socket.on('server:mouse-up', function(flag) {
			isDrawing = flag
		})

		socket.on('server:image-upload' , function(update) {
			drawImageOnCanvas(update.imageUrl)
		})
	}	
})