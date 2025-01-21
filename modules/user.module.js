const mongoose = require('mongoose');
const bcrypt = require('bcrypt');

const userSchema = new mongoose.Schema({
    userName: { type: String },
    mobileNo: { type: Number },
    emailID: { type: String },
    password: { type: String },
    roles: {
        type: [Number],
        enum: [0, 1, 2] // 0: User, 1: Organizer, 2: Admin
    },
    imageUrl: {type: String},
    code: { type: Number }, // OTP Code
    codeExpiry: { type: Date } // OTP Expiry
});

userSchema.pre('save', function (next) {
    if (!this.roles.includes(0)) {
        this.roles.unshift(0);
    }
    this.roles = [...new Set(this.roles)];
    next();
});


userSchema.pre('save', async function(next){
    if (this.isModified('password')) {
        const salt = await bcrypt.genSalt();
        this.password = await bcrypt.hash(this.password, salt);
    }
    next();
});

userSchema.statics.loginWithMobile = async function(mobileNo, password) {
  const user = await this.findOne({ mobileNo : mobileNo });
  if (user) {
      const auth = await bcrypt.compare(password, user.password);
      if (auth) {
          return user;
      }
      throw Error('Incorrect password');
  }
  throw Error('Mobile number not registered');
};

userSchema.statics.loginWithEmail = async function(emailID, password) {
  const user = await this.findOne({ emailID : emailID });
  if (user) {
      const auth = await bcrypt.compare(password, user.password);
      if (auth) {
          return user;
      }
      throw Error('Incorrect password');
  }
  throw Error('Email not registered');
};

const User = mongoose.model('User', userSchema);
module.exports = User;