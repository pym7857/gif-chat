/* 라우터에서 몽고디비와 웹 소켓 모두에 접근할 수 있습니다. */
const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const Room = require('../schemas/room');
const Chat = require('../schemas/chat');

const router = express.Router();

/* 채팅방 목록이 보이는 메인 화면을 렌더링하는 라우터 [ GET / ] -> main.pug로 이동 */
router.get('/', async (req, res, next) => {
    try {
        const rooms = await Room.find({});
        res.render('main', { rooms, title:'GIF 채팅방', error: req.flash('roomError') });   // main.pug
    } catch (e) {
        console.error(e);
        next(e);
    }
});

/* 채팅방 생성 화면을 렌더링하는 라우터 [GET /room ] */
router.get('/room', (req, res) => {
    res.render('room', { title:'GIF 채팅방 생성' });    // room.pug
});

/* 채팅방을 만드는 라우터 [ POST /room ] */
router.post('/room', async (req, res, next) => {
    try {
        const room = new Room({
            title: req.body.title,
            max: req.body.max,
            owner: req.session.color,
            password: req.body.password,
        });
        const newRoom = await room.save();
        const io = req.app.get('io');               // (socket.js에서)app.set('io', io)로 저장했던 io 객체를 req.app.get('io')로 가져옵니다.
        io.of('/room').emit('newRoom', newRoom);    // emit('이벤트명', 데이터) : /room 네임스페이스에 연결한 모든 클라이언트에게 데이터를 보내는 메서드
                                                    // newRoom 이벤트 처리 -> main.pug의 script부분
        res.redirect(`/room/${newRoom._id}?password=${req.body.password}`);
    } catch (e) {
        console.error(e);
        next(e);
    }
});

/* 특정 채팅방을 렌더링하는 라우터 [ GET /room/:id ] */
router.get('/room/:id', async (req, res, next) => {
    try {
        const room = await Room.findOne({ _id: req.params.id });
        const io = req.app.get('io');
        if (!room) {
            req.flash('roomError','존재하지 않는 방입니다.');
            return res.redirect('/');
        }
        if (room.password && room.password !== req.query.password) {    // 비밀방일 경우에, 비밀번호가 맞는지
            req.flash('roomError','비밀번호가 틀렸습니다.');
            return res.redirect('/');
        }
        const { rooms } = io.of('/chat').adapter;   // io.of(네임스페이스).adapter.rooms : 그룹안의 소켓들을 확인할 수 있습니다.
                                                    // - io.of('/chat').adapter.rooms에 방 목록이 들어있습니다.
                                                    // - io.of('/chat').adapter.rooms[req.params.id]를 하면 해당 방의 소켓 목록이 나옵니다.
                                                    // - 이것으로 소켓의 수를 세서 참가 인원의 수를 알아낼 수 있습니다.
        if (rooms && rooms[req.params.id] && room.max <= rooms[req.params.id].length) {
            req.flash('roomError','허용 인원이 초과하였습니다.');
            return res.redirect('/');    
        }
        /* 방 접속시 기존 채팅 내역 불러오기 */
        const chats = await Chat.findOne({ room: room._id }).sort('createdAt');
        console.log('chats = ', chats);
        return res.render('chat', {     // chat.pug
            room,
            title: room.title,
            chats,
            user: req.session.color,
        });
    } catch (e) {
        console.error(e);
        return next(e);
    }
});

/* 채팅방을 삭제하는 라우터 [ DELETE /room/:id ] */
router.delete('/room/:id', async (req, res, next) => {
    try {
        await Room.remove({ _id: req.params.id });  // 채팅방 삭제
        await Chat.remove({ room: req.params.id }); // 채팅 내역 삭제
        res.send('OK');
        setTimeout(() => {
            req.app.get('io').of('/room').emit('removeRoom', req.params.id);
        }, 2000);   // 2초 뒤에 웹 소켓으로 /room 네임스페이스에 방이 삭제되었음(removeRoom 이벤트)을 알립니다.
    } catch (e) {
        console.error(e);
        next(e);
    }
});

/* 채팅을 하는 부분 [ POST /room/:id/chat ] */
/* 채팅을 할 때마다 채팅내용이 [POST /room/:id/chat] 라우터로 전송되고, 라우터에서 다시 웹 소켓으로 메시지를 보냅니다. */
router.post('/room/:id/chat', async (req, res, next) => {
    try {
        const chat = new Chat({
            room: req.params.id,
            user: req.session.color,
            chat: req.body.chat,
        });
        await chat.save();  // 채팅을 데이터베이스에 저장 
        req.app.get('io').of('/chat').to(req.params.id).emit('chat', chat);     // 같은 방에 있는 소켓들에게 메시지 데이터를 전송
        res.send('ok');
    } catch (e) {
        console.error(e);
        next(e);
    }
});

fs.readdir('uploads', (error) => {
    if (error) {
        console.error('uploads 폴더가 없어 uploads 폴더를 생성합니다.');
        fs.mkdirSync('uploads');
    }
});

/*
    upload는 미들웨어를 만드는 객체 이다.
    upload 변수는 미들웨어를 만드는 여러 가지 메서드를 가지고 있다.
    자주 쓰이는 것은 single, array, fields, none이다.
 */
const upload = multer({
    storage: multer.diskStorage({
        destination(req, file, cb) {
            cb(null, 'uploads/');
        },
        filename(req, file, cb) {
            const ext = path.extname(file.originalname);
            cb(null, path.basename(file.originalname, ext) + new Date().valueOf() + ext);
        },
    }),
    limits: { fileSize: 5 * 1024 * 1024 },
});

/*
    single : 하나의 이미지를 업로드할 때 사용하며, req.file 객체를 생성한다.
    single : 이미지 하나는 req.file로, 나머지 정보는 req.body로
 */
router.post('/room/:id/gif', upload.single('gif'), async (req, res, next) => {
    try {
        const chat = new Chat({
            room: req.params.id,
            user: req.session.color,
            gif: req.file.filename,
        });
        await chat.save();
        req.app.get('io').of('/chat').to(req.params.id).emit('chat', chat);   // 같은 방에 있는 소켓들에게 메시지 데이터를 전송
        res.send('ok');
    } catch (e) {
        console.error(e);
        next(e);
    }
});

module.exports = router;

/* Tip. 서버를 실행하기 전에 몽고디비를 먼저 실행해야 합니다 !! */