// Generate random room name if needed
if (!location.hash) {
  location.hash = Math.floor(Math.random() * 0xFFFFFF).toString(16);
}
const roomHash = location.hash.substring(1);

// TODO: Replace with your own channel ID
const drone = new ScaleDrone('BIZhUxYEmI9Hwh9I');
// Room name needs to be prefixed with 'observable-'
const roomName = 'observable-' + roomHash;
const configuration = {
  iceServers: [{
    urls: 'stun:stun.l.google.com:19302'
  }]
};
let room;
let pcs = [];
let localStream;
function onSuccess() {
  console.log("success");
};
function onError(error) {
  console.error(error);
};
navigator.mediaDevices.getUserMedia({
    audio: true,
    video: false,
  }).then(stream => {
    console.log(stream);
    localStream = stream;
    localVideo.srcObject = stream;}, onError);
drone.on('open', error => {
  if (error) {
    return console.error(error);
  }
  room = drone.subscribe(roomName);
  room.on('open', error => {
    if (error) {
      onError(error);
    }
  });
  // We're connected to the room and received an array of 'members'
  // connected to the room (including us). Signaling server is ready.
  room.on('members', members => {
    console.log('MEMBERS', members);
    // If we are the second user to connect to the room we will be creating the offer
    setTimeout(function(){ startWebRTC(members);}, 800);
  });
});

// Send signaling data via Scaledrone
function sendMessage(message) {
  drone.publish({
    room: roomName,
    message
  });
}

function startWebRTC(members) {
  
  console.log(localStream);
  
  var i;
  for (i = 0; i < members.length; i++) {
    if (members[i].id !== drone.clientId) {
      var newPc = {pc: new RTCPeerConnection(configuration), id: members[i].id};
      console.log(newPc);
      
      newPc.pc.onicecandidate = event => {
        console.log("sending candidate");
        if (event.candidate) {
          setTimeout(function(){ sendMessage({'candidate': event.candidate, 'id': drone.clientId}); }, 500);
        }
      };
      localStream.getTracks().forEach(track => {
          newPc.pc.addTrack(track, localStream);
      });
      newPc.pc.onnegotiationneeded = () => {
       console.log("sending offer");
       
        setTimeout(function(){ newPc.pc.createOffer().then(event => localDescCreated(event, newPc.id)).catch(onError); }, 500);
      }
      
      newPc.pc.ontrack = event => {
        const stream = event.streams[0];
        if (!remoteVideo.srcObject || remoteVideo.srcObject.id !== stream.id) {
          remoteVideo.srcObject = stream;
        }
      };
      pcs.push(newPc);
      console.log(pcs);
    }
  }

  

  // Listen to signaling data from Scaledrone
  room.on('data', (message, client) => {
    
    // Message was sent by us
    if (client.id === drone.clientId) {
      return;
    }
    var i;
    console.log(JSON.stringify(message));
    if (message.sdp) {
      var n = -1;
      for (i = 0; i < pcs.length; i++) {
        if (pcs[i].id === client.id) {
          n = i
          break;
        }
      }
      if (n == -1) {
        
        var newPc = {pc: new RTCPeerConnection(configuration), id: client.id};
        newPc.pc.onicecandidate = event => {
          console.log("sending candidate");
          if (event.candidate) {
            setTimeout(function(){ sendMessage({'candidate': event.candidate, 'id': drone.clientId}); }, 500);
          }
        };
        localStream.getTracks().forEach(track => {
          console.log("adding tracks");
          newPc.pc.addTrack(track, localStream);
        });
        newPc.pc.ontrack = event => {
          console.log("receiving track");
          const stream = event.streams[0];
          if (!remoteVideo.srcObject || remoteVideo.srcObject.id !== stream.id) {
            remoteVideo.srcObject = stream;
          }
        };
        pcs.push(newPc);
        n = pcs.length - 1;
      }
      // This is called after receiving an offer or answer from another peer
      pcs[n].pc.setRemoteDescription(new RTCSessionDescription(message.sdp), () => {
        // When receiving an offer lets answer it
        if (pcs[n].pc.remoteDescription.type === 'offer') {
            setTimeout(function(){ pcs[n].pc.createAnswer().then(event => {
              localDescCreated(event, client.id);
            console.log("making a new connection from offer");
            }).catch(onError);}, 500);
            console.log("sending answer");
          }
        }
      , onError);
    } else if (message.candidate) {
      console.log("taking a candidate");
      var n = -1;
      console.log(pcs.length);
      for (i = 0; i < pcs.length; i++) {
        console.log(pcs[i].id);
        if (pcs[i].id === client.id) {
          n = i;
          break;
        }
      }
      console.log(JSON.stringify(pcs[n]));
      // Add the new ICE candidate to our connections remote description
      pcs[n].pc.addIceCandidate(
        new RTCIceCandidate(message.candidate), onSuccess, onError);
    }
  });
}

function localDescCreated(desc, id) {
  var n = -1;
  
  for (i = 0; i < pcs.length; i++) {
    if (pcs[i].id === id) {
      n = i;
      break;
    }
  }
  console.log("setting local description");
  pcs[n].pc.setLocalDescription(
    desc,
    () => sendMessage({'sdp': pcs[n].pc.localDescription}),
    onError
  );
  
  console.log(pcs[0]);
}
