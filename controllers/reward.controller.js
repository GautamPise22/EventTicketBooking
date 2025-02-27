const Reward = require('../modules/reward.module.js');
const User = require('../modules/user.module.js');
const Booking = require('../modules/bookingdetails.module.js');
const Wallet = require('../modules/wallet.module.js');
let notificationController = require('./notification.controller');
const ObjectId = require('mongoose').Types.ObjectId;
const mongoose = require('mongoose');

module.exports = {
    getAllUserRewards,
    redeemReward,
    redeemAllRewards,
    getRewardsCount,
    generateRewardIfEligible
};

async function generateRewardIfEligible(userId) {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
        const today = new Date();
        const fifteenDaysAgo = new Date();
        fifteenDaysAgo.setDate(today.getDate() - 15);

        // Find user and last reward date
        const user = await User.findById(userId).session(session);
        if (!user) {
            await session.abortTransaction();
            session.endSession();
            return { success: false, message: 'User not found' };
        }

        // Ensure reward is generated only once per 15-day period
        if (user.lastRewardDate && new Date(user.lastRewardDate) > fifteenDaysAgo) {
            await session.abortTransaction();
            session.endSession();
            return { success: false, message: 'Reward already generated in the last 15 days' };
        }

        // Count bookings in the last 15 days
        const bookingCount = await Booking.countDocuments({
            userId,
            bookingDate: { $gte: fifteenDaysAgo }
        }).session(session);

        if (bookingCount < 15) {
            await session.abortTransaction();
            session.endSession();
            return { success: false, message: 'Not enough bookings for a reward' };
        }

        // Determine reward type (win or lose)
        const isWin = Math.random() > 0.5; // 50% chance to win
        const rewardType = isWin ? 'win' : 'lose';
        const rewardAmount = isWin ? Math.floor(Math.random() * 20) + 1 : 0; // Random amount 1-20 if win, else 0

        // Set expiration date (30 days from today)
        const expirationDate = new Date();
        expirationDate.setDate(expirationDate.getDate() + 7);

        // Create reward
        const newReward = new Reward({
            userId,
            amount: rewardAmount,
            type: rewardType,
            expiresAt: expirationDate,
            isRevealed: false
        });

        await newReward.save({ session });

        // Update user's last reward date
        user.lastRewardDate = today;
        await user.save({ session });

        await session.commitTransaction();
        session.endSession();

        return { success: true, message: `Reward generated: ${rewardType} - Rs.${rewardAmount}`, reward: newReward };

    } catch (error) {
        await session.abortTransaction();
        session.endSession();
        return { success: false, message: 'Error generating reward', error: error.message };
    }
}

async function getAllUserRewards(req, res) {
    try {
        const userId = req.params.userId; 
        const rewards = await Reward.find({ userId }).sort({ issuedAt: -1 });

        res.status(200).json(rewards);
    } catch (error) {
        res.status(500).json({ message: 'Error fetching rewards', error });
    }
}

async function redeemReward(req, res) {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
        const rewardId = req.params.rewardId;
        const adminWalletId = process.env.ADMIN_WALLET_ID;
        const currentDate = new Date();

        // Find reward
        const reward = await Reward.findOne({ _id: rewardId }).session(session);

        if (!reward) {
            await session.abortTransaction();
            session.endSession();
            return res.status(404).json({ message: 'Reward not found' });
        }

        // Check if the reward is expired
        if (reward.expiresAt && reward.expiresAt < currentDate) {
            await session.abortTransaction();
            session.endSession();
            return res.status(400).json({ message: 'Reward has expired and cannot be redeemed' });
        }

        if (reward.isRevealed && !reward.isScratching) {
            await session.abortTransaction();
            session.endSession();
            return res.status(400).json({ message: 'Reward already redeemed or not scratched' });
        }

        // Find admin wallet
        let adminWallet = await Wallet.findById(adminWalletId).session(session);
        if (!adminWallet) {
            await session.abortTransaction();
            session.endSession();
            return res.status(500).json({ message: 'Admin wallet not found' });
        }

        // Ensure admin wallet has enough balance
        if (adminWallet.balance < reward.amount) {
            await session.abortTransaction();
            session.endSession();
            return res.status(400).json({ message: 'Insufficient balance in admin wallet' });
        }

        // Find user and user wallet
        let user = await User.findById(reward.userId).session(session);
        let userWallet = await Wallet.findOne({ userId: reward.userId }).session(session);

        if (!user || !userWallet) {
            await session.abortTransaction();
            session.endSession();
            return res.status(404).json({ message: 'User or wallet not found' });
        }

        // Deduct from admin wallet
        adminWallet.balance -= reward.amount;
        adminWallet.transactions.push({
            amount: reward.amount,
            type: 'Debit',
            description: `Reward Redeemed by ${user.userName} - Rs.${reward.amount}`
        });

        await adminWallet.save({ session });

        // Credit to user wallet
        userWallet.balance += reward.amount;
        userWallet.transactions.push({
            amount: reward.amount,
            type: 'Credit',
            description: `Reward Redeemed - Rs.${reward.amount}`
        });

        await userWallet.save({ session });

        // Mark reward as claimed
        reward.isRevealed = true;
        await reward.save({ session });

        // Commit transaction
        await session.commitTransaction();
        session.endSession();

        // Send notification outside transaction
        await notificationController.sendNotification(
            'reward',
            'Reward Redeemed',
            `You have successfully redeemed Rs.${reward.amount} in your Wallet.`,
            reward.userId
        );

        res.status(200).json({ message: 'Reward redeemed successfully', reward });

    } catch (error) {
        await session.abortTransaction();
        session.endSession();
        res.status(500).json({ message: 'Error redeeming reward', error: error.message });
    }
}



async function redeemAllRewards(req, res) {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
        const userId = req.params.userId;
        const adminWalletId = process.env.ADMIN_WALLET_ID;
        const currentDate = new Date();

        // Find all unredeemed rewards
        const rewards = await Reward.find({ userId, isRevealed: false }).session(session);

        if (!rewards.length) {
            await session.abortTransaction();
            session.endSession();
            return res.status(400).json({ message: 'No pending rewards to redeem' });
        }

        // Separate expired rewards
        const expiredRewards = rewards.filter(reward => reward.expiresAt && reward.expiresAt < currentDate);
        const validRewards = rewards.filter(reward => !reward.expiresAt || reward.expiresAt >= currentDate);

        if (!validRewards.length) {
            await session.abortTransaction();
            session.endSession();
            return res.status(400).json({ 
                message: 'All pending rewards have expired', 
                expiredRewards: expiredRewards.map(r => ({ id: r._id, amount: r.amount, expiresAt: r.expiresAt }))
            });
        }

        const totalAmount = validRewards.reduce((sum, reward) => sum + reward.amount, 0);

        // Fetch admin wallet
        let adminWallet = await Wallet.findById(adminWalletId).session(session);
        if (!adminWallet) {
            await session.abortTransaction();
            session.endSession();
            return res.status(500).json({ message: 'Admin wallet not found' });
        }

        // Ensure admin wallet has sufficient funds
        if (adminWallet.balance < totalAmount) {
            await session.abortTransaction();
            session.endSession();
            return res.status(400).json({ message: 'Insufficient balance in admin wallet' });
        }

        // Fetch user wallet
        let userWallet = await Wallet.findOne({ userId }).session(session);
        if (!userWallet) {
            await session.abortTransaction();
            session.endSession();
            return res.status(404).json({ message: 'User wallet not found' });
        }

        // Fetch user details
        let user = await User.findById(userId).session(session);
        if (!user) {
            await session.abortTransaction();
            session.endSession();
            return res.status(404).json({ message: 'User not found' });
        }

        // Deduct from admin wallet
        adminWallet.balance -= totalAmount;
        adminWallet.transactions.push({
            amount: totalAmount,
            type: 'Debit',
            description: `Reward Redeemed by ${user.userName} - Rs.${totalAmount}`
        });

        await adminWallet.save({ session });

        // Credit user wallet
        userWallet.balance += totalAmount;
        userWallet.transactions.push({
            amount: totalAmount,
            type: 'Credit',
            description: `All Rewards Redeemed - Rs.${totalAmount}`
        });

        await userWallet.save({ session });

        // Mark valid rewards as redeemed
        await Reward.updateMany(
            { _id: { $in: validRewards.map(r => r._id) } },
            { $set: { isRevealed: true } },
            { session }
        );

        // Commit transaction
        await session.commitTransaction();
        session.endSession();

        // Send notification outside transaction
        await notificationController.sendNotification(
            'reward',
            'All Rewards Redeemed',
            `You have successfully redeemed Rs.${totalAmount} in your Wallet.`,
            userId
        );

        res.status(200).json({ 
            message: `Redeemed rewards worth Rs.${totalAmount}`, 
            expiredRewards: expiredRewards.map(r => ({ id: r._id, amount: r.amount, expiresAt: r.expiresAt }))
        });

    } catch (error) {
        await session.abortTransaction();
        session.endSession();
        res.status(500).json({ message: 'Error redeeming all rewards', error: error.message });
    }
}




async function getRewardsCount(req, res) {
    try {
        const userId = req.params.userId;

        const count = await Reward.countDocuments({ userId, isRevealed: false });

        res.status(200).json({ count });
    } catch (error) {
        res.status(500).json({ message: 'Error fetching reward count', error });
    }
}

