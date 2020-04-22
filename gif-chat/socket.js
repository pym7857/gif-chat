/* 서버의 socket.js에 웹 소켓 이벤트를 연결합니다. */
const SocketIO = require('socket.io');
const axios = require('axios');

module.exports = (server, app, sessionMiddleware) => {
    const io = SocketIO(server, { path:'/socket.io' });

    app.set('io',io);   // 라우터에서 io 객체를 쓸 수 있게 저장해둡니다.
    const room = io.of('/room');
    const chat = io.of('/chat');

    /* io.use메서드에 미들웨어(req, res, next)를 장착할 수 있습니다. */
    /* 이 부분은 모든 웹 소켓 연결 시마다 실행됩니다. */
    io.use((socket, next) => {
        sessionMiddleware(socket.request, socket.request.res, next);
    });

    room.on('connection', (socket) => {
        console.log('room 네임스페이스에 접속');
        socket.on('disconnect', () => {
            console.log('room 네임스페이스 접속 해제');
        });
    });

    chat.on('connection', (socket) => {
        console.log('chat 네임스페이스에 접속');
        const req = socket.request;
        const { headers: { referer } } = req;   // socket.request.headers.referer를 통해 현재 웹 페이지의 URL을 가져올 수 있고,
        const roomId = referer                  // URL에서 방 아이디 부분을 추출하였습니다.
            .split('/')[referer.split('/').length -1]
            .replace(/\?.+/,'');
        socket.join(roomId);        // 접속 시 : socket.join(방 아이디)

        /* socket.to(방 아이디)메서드로 특정 방에 데이터를 보낼 수 있습니다.*/
        /* 방금 전에 세션 미들웨어와 Socket.IO를 연결했으므로, 웹 소켓에서 세션을 사용할 수 있습니다. */
        socket.to(roomId).emit('join', {    // socket.emit('이벤트명', {메시지}) : 현재 연결되어 있는 클라이언트 소켓에 '이벤트명'으로 {메시지}데이터로 이벤트를 보낸다.
            user:'system',
            char: `${req.session.color}님이 입장하셨습니다.`,  /* 방에 참여할 때(=join), 방에 누군가가 입장했다는 '시스템 메시지'를 보냅니다.*/
        });
        socket.on('disconnect', () => {
            console.log('chat 네임스페이스 접속 해제');
            socket.leave(roomId);   // 접속 해제 시 : sokcet.leave(방 아이디)
            
            /* 사람 수를 구해서 참여자 수가 0명이면 방을 제거하는 HTTP요청을 보냅니다. */
            /* socket.apater.rooms[방 아이디]에 참여 중인 소켓 정보가 들어 있습니다. */
            const currentRoom = socket.adapter.rooms[roomId];
            const userCount = currentRoom ? currentRoom.length : 0;
            if (userCount === 0) {
                axios.delete(`http://localhost:8005/room/${roomId}`)
                    .then(() => {
                        console.log('방 제거 요청 성공');
                    })
                    .catch((e) => {
                        console.error(e);
                    });
            } else {
                socket.to(roomId).emit('exit', {
                    user: 'system',
                    chat: `${req.session.color}님이 퇴장하셨습니다.`,
                });
            }
        });
    });
};



/* ws대신 socket.io를 활용해본 버전 */
/*
const SocketIO = require('socket.io');

module.exports = (server) => {
    const io = SocketIO(server, { path:'/socket.io' }); // socket.io 패키지를 불러와서 익스프레스 서버와 연결합니다. (두번째 인자: 옵션)

    io.on('connection', (socket) => {
        const req = socket.request;     // socket.request : 요청 객체에 접근 가능 
        const ip = req.headers['x-forwarded-for'] || req.connection.remoteAddress;
        console.log('새로운 클라이언트 접속!', ip, socket.id, req.ip);  // socket.id로 소켓 고유의 아이디를 가져올 수 있습니다.
        
        socket.on('disconnect', () => {
            console.log('클라리언트 접속 해제', ip. socket.id);
            clearInterval(socket.interval);
        });
        socket.on('error', (error) => {
            console.error(error);
        });
        socket.on('reply', (data) => {              // 사용자가 직접 만든 이벤트(ws모듈과의 차이점)
            console.log(data);
        });
        socket.interval = setInterval(() => {
            socket.emit('news','Hello Socket.IO');  // 전송: emit(이벤트 이름, 데이터)
        }, 3000);
    });
};
*/



/* 웹 소켓 서버(wss)에 이벤트 리스너를 붙여준다. */
/* 웹 소켓은 이벤트 기반으로 작동한다. */
/* 
const WebSocket = require('ws');

module.exports = (server) => {
    const wss = new WebSocket.Server({ server });

    wss.on('connection', (ws, req) => {     // (이벤트)connection: 클라이언트와 서버가 웹 소켓 연결을 맺을 때
        const ip = req.headers['x-forwarded-for'] || req.connection.remoteAddress;  // 클라이언트의 ip를 얻어오는 유명한 방법 
        console.log('새로운 클라이언트 접속', ip);
        ws.on('message', (message) => {     // (이벤트)message : 클라이언트로부터 메세지가 왔을 때
            console.log(message);
        });
        ws.on('error', (error) => {         // (이벤트)error : 웹 소켓 연결 중 문제가 생겼을 때
            console.error(error);
        });
        ws.on('close', () => {              // (이벤트)close : 클라이언트와 연결이 끊겼을 때
            console.log('클라이언트 접속 해제', ip);
            clearInterval(ws.interval);     // 이 부분이 없다면, 메모리 누수가 발생한다.
        });
        // 3초마다 연결된 모든 클라이언트에게 메세지를 보내는 부분
        const interval = setInterval(() => {
            if (ws.readyState === ws.OPEN) {    // 먼저, readyState가 OPEN인지 확인한다.
                ws.send('서버에서 클라이언트로 메세지를 보냅니다.');
            }
        }, 3000);
        ws.interval = interval;
    });
}; 
*/

/* 크롬에서는 로컬 호스트로 접속한 경우, IP가 ::1로 뜹니다. */