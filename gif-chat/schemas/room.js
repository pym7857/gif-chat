/* 채팅방 스키마 */
const mongoose = require('mongoose');

const { Schema } = mongoose;
const roomSchema = new Schema({
    title: {                // 방 제목(title)
        type: String,
        required: true,
    },
    max: {                  // 최대 수용 인원(max)
        type: Number,
        required: true,
        defaultValue: 10,   // 기본 10명
        min: 2,             // 최소 2명
    },
    owner: {                // 방장(owner)
        type: String,
        required: true,
    },
    password: String,       // 방 비밀번호(password) (required 없으므로 필수는 아니다.)
    createdAt: {            // 생성 시간(createdAt)
        type: Date,
        default: Date.now,
    },
});

module.exports = mongoose.model('Room', roomSchema);