const express = require('express');
const path = require('path');
const morgan = require('morgan');
const cookieParser = require('cookie-parser');
const session = require('express-session');
const flash = require('connect-flash');
const ColorHash = require('color-hash');    // 세션 아이디를 HEX 형식의 색상 문자열(#12C6B8..등)로 바꿔주는 패키지 (해시값 이용)
require('dotenv').config();

const webSocket = require('./socket');
const indexRouter = require('./routes');
const connect = require('./schemas');   // 서버를 실행할 때 몽고디비에 바로 접속할 수 있도록 서버와 몽구스를 연결합니다.

const app = express();
connect();                              // 서버를 실행할 때 몽고디비에 바로 접속할 수 있도록 서버와 몽구스를 연결합니다.

/* 사용자의 이름(#12C6B8 등..)은 세션에 들어있습니다. */
/* Socket.IO에서 세션에 접근하려면 추가 작업이 필요합니다. */
/* Socket.IO도 미들웨어를 사용할 수 있으므로 express-session을 공유하면 됩니다. */
const sessionMiddleware = session({   
    resave: false,
    saveUninitialized: false,
    secret: process.env.COOKIE_SECRET,
    cookie: {
        httpOnly: true,
        secure: false,
    },
});

app.set('views', path.join(__dirname,'views'));
app.set('view engine', 'pug');
app.set('port', process.env.PORT || 8005);

app.use(morgan('dev'));
app.use(express.static(path.join(__dirname,'public')));
app.use('/gif', express.static(path.join(__dirname,'uploads')));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser(process.env.COOKIE_SECRET));
app.use(sessionMiddleware);
app.use(flash());

/* 세션아이디에 color속성 부여 -> 앞으로 이게 사용자 아이디 */
app.use((req, res, next) => {
    if (!req.session.color) {
        const colorHash = new ColorHash();
        req.session.color = colorHash.hex(req.sessionID);   // req.sessionID를 바탕으로 color속성을 생성합니다.
    }
    next();
});

app.use('/', indexRouter);

// 404 에러 핸들러 
app.use((req, res, next) => {
    const err = new Error('Not Found');
    err.status = 404;
    next(err);
});

// 에러 핸들러 
app.use((err, req, res, next) => {
    res.locals.message = err.message;
    res.locals.error = req.app.get('env') === 'development' ? err : {};
    res.status(err.status || 500);
    res.render('error');
});

const server = app.listen(app.get('port'), () => {
    console.log(app.get('port'),'번 포트에서 대기 중');
});

webSocket(server, app, sessionMiddleware);      // 웹 소켓을 익스프레스 서버(server)에 연결
                                                // 웹 소켓(WS)과 익스프레스(HTTP)는 같은 포트를 공유할 수 있으므로 별도의 작업이 필요 X

                                                // socket.js와 app.js 간에 express-session 미들웨어를 공유