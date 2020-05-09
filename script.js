// Generate random room name if needed
const roomHash = location.hash.substring(1);
console.log(roomHash);
//Variables
const drone = new ScaleDrone('BIZhUxYEmI9Hwh9I');
const roomName = 'observable-' + roomHash;
const configuration = {
  iceServers: [{
    urls: 'stun:stun.l.google.com:19302'
  }]
};
let room;
let members;
let pcs = [];
let localStream;
let finishedMedia = false;
function onSuccess() {
  console.log("success");
};
function onError(error) {
  console.error(error);
};
//Gets the user video and audio streams
navigator.mediaDevices.getUserMedia({
    audio: true,
    video: true,
  }).then(stream => {
    console.log(stream);
    localStream = stream;
    localVideo.srcObject = stream;
    finishedMedia = true;
}, onError);
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
  room.on('members', memberList => {
    console.log('MEMBERS', memberList);
    members = memberList;
    if (members.length > 4) {
      window.location.href = window.location.href.substring(0, window.location.href - 14) + "home.html";
    }
    //Launches startWebRTC
    waitForStreams();
  });
});

//Promise function that waits for user media to finish completely.
function waitForStreams() {
  if (finishedMedia == true) {
      console.log("finished waiting for streams");
      startWebRTC();
   } else {
     setTimeout(waitForStreams, 1000);
   }
  console.log("heyo");
}

function createOffer(pc) {
  pc.onnegotiationneeded = () => {
      console.log("sending offer");
      setTimeout(function(){ pc.createOffer().then(event => localDescCreated(event, pc.id)).catch(onError); }, 500);
    }
}

// Send signaling data via Scaledrone
function sendMessage(message) {
  drone.publish({
    room: roomName,
    message
  });
}
//Checks for other members in room and creates a new PeerConnection offer for each one.
function startWebRTC() {
  console.log(members);
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
      newPc.pc.id = newPc.id;
      createOffer(newPc.pc);
      
      
      setOnTrack(newPc.pc);
      pcs.push(newPc);
      console.log(pcs);
    }
  }

  function setOnTrack(pc) {
    pc.ontrack = event => {
        var stream = event.streams[0];
        console.log(remoteVideo);
        console.log(stream);
        if (remoteVideo.attribute != stream.id && remoteVideo1.attribute != stream.id && remoteVideo2.attribute != stream.id) {
          if (!(remoteVideo.srcObject || remoteVideo.attribute === stream.id)) {
            remoteVideo.srcObject = stream;
            remoteVideo.attribute = stream.id;
          } else if (!(remoteVideo1.srcObject || remoteVideo1.attribute === stream.id)) {
            remoteVideo1.srcObject = stream;
            remoteVideo1.attribute = stream.id;
          } else if (!(remoteVideo2.srcObject || remoteVideo2.attribute === stream.id)) {
            remoteVideo2.srcObject = stream;
            remoteVideo2.attribute = stream.id;
          }
        }
      };
  }

  // Listen to signaling data from Scaledrone
  room.on('data', (message, client) => {
    
    // Message was sent by us
    if (client.id === drone.clientId) {
      return;
    }
    var i;
    console.log(JSON.stringify(message));
    //message.sdp implies that an offer/answer is being received.
    if (message.sdp) {
      var n = -1;
      for (i = 0; i < pcs.length; i++) {
        if (pcs[i].id === client.id) {
          n = i
          break;
        }
      }
      if (n == -1) {
        console.log("creating new pcs");
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
        setOnTrack(newPc.pc);
        pcs.push(newPc);
        console.log(newPc)
        n = pcs.length - 1;
      }
      // This is called after receiving an offer or answer from another peer
      if (message.target === drone.clientId) {
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
        }
      //message.candidate implies an ICE candidate being sent
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
//Updates the local description for a PC sdp
function localDescCreated(desc, id) {
  var n = -1;
  
  for (i = 0; i < pcs.length; i++) {
    if (pcs[i].id === id) {
      n = i;
      break;
    }
  }
  console.log(desc);
  console.log("setting local description for " + id + ' ' + pcs[n].pc.localDescription);
  pcs[n].pc.setLocalDescription(
    desc,
    () => sendMessage({'sdp': pcs[n].pc.localDescription, 'target': id}),
    onError
  );
  
}
