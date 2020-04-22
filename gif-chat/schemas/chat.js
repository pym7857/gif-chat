/* 채팅 스키마 */
const mongoose = require('mongoose');

const { Schema } = mongoose;
const { Types: { ObjectId } } = Schema;
const chatSchema = new Schema({
    room: {                 // 채팅방 아이디(room) 
        type: ObjectId,     // Room컬렉션의 ObjectId가 들어가게 된다.
        required: true,
        ref:'Room',
    },
    user: {                 // 채팅을 한 사람(user)
        type: String,
        required: true,
    },
    chat: String,           // 채팅 내역(chat)
    gif: String,            // GIF 이미지 주소(img)
    createdAt: {            // 채팅 시간(createdAt)
        type: Date,
        default: Date.now,
    },
});

module.exports = mongoose.model('Chat', chatSchema);