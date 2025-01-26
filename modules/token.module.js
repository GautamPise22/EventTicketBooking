const mongoose = require('mongoose');

const tokenSchema = new mongoose.Schema({
    token: { type: String, required: true, unique: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    used: { type: Boolean, default: false },
    expiresAt: { type: Date, required: true }
});

module.exports = mongoose.model('Token', tokenSchema);
