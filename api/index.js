const express = require('express');
const app = express();
app.use(express.json());

let users = {};
let sessions = {};
let withdrawals = [];
let transactions = [];

function generateReferralCode() {
    return Math.random().toString(36).substring(2, 8).toUpperCase();
}

function getUser(username) {
    if (!username) return null;
    return users[username] || null;
}

const fs = require('fs');
const USERS_FILE = 'users.json';
const WITHDRAWALS_FILE = 'withdrawals.json';
const TRANSACTIONS_FILE = 'transactions.json';

function saveData() {
    try {
        fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
        fs.writeFileSync(WITHDRAWALS_FILE, JSON.stringify(withdrawals, null, 2));
        fs.writeFileSync(TRANSACTIONS_FILE, JSON.stringify(transactions, null, 2));
    } catch (e) {}
}

function loadData() {
    try {
        if (fs.existsSync(USERS_FILE)) users = JSON.parse(fs.readFileSync(USERS_FILE, 'utf8'));
        if (fs.existsSync(WITHDRAWALS_FILE)) withdrawals = JSON.parse(fs.readFileSync(WITHDRAWALS_FILE, 'utf8'));
        if (fs.existsSync(TRANSACTIONS_FILE)) transactions = JSON.parse(fs.readFileSync(TRANSACTIONS_FILE, 'utf8'));
    } catch (e) {}
}

loadData();
setInterval(saveData, 10000);

const FEE_RATE = 0.05; // 5%

app.get('/', (req, res) => {
    res.sendFile(__dirname + '/../index.html');
});

app.post('/api/register', (req, res) => {
    const { username, password, referral } = req.body;
    
    if (!username || !password) {
        return res.json({ status: 'error', message: 'Please enter username and password' });
    }
    
    if (users[username]) {
        return res.json({ status: 'error', message: 'Username already exists' });
    }
    
    users[username] = {
        password: password,
        balance: 0.5,
        total_earned: 0.5,
        total_mined: 0,
        referrals: [],
        referral_code: generateReferralCode(),
        referred_by: referral || '',
        wallet: '',
        network: 'sol',
        is_mining: false,
        referral_bonus: 0,
        total_withdrawn: 0,
        total_fees_paid: 0
    };
    
    if (referral && users[referral]) {
        users[referral].balance += 0.5;
        users[referral].total_earned += 0.5;
        users[referral].referral_bonus += 0.5;
        users[referral].referrals.push(username);
    }
    
    sessions[username] = true;
    res.json({ 
        status: 'success', 
        message: 'Account created! Welcome bonus: 0.5 USDT',
        username: username 
    });
});

app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    
    if (!username || !password) {
        return res.json({ status: 'error', message: 'Please enter username and password' });
    }
    
    const user = getUser(username);
    if (!user) {
        return res.json({ status: 'error', message: 'User not found' });
    }
    
    if (user.password !== password) {
        return res.json({ status: 'error', message: 'Incorrect password' });
    }
    
    sessions[username] = true;
    res.json({ 
        status: 'success', 
        message: 'Logged in!',
        username: username,
        user: {
            balance: user.balance,
            total_earned: user.total_earned,
            total_mined: user.total_mined,
            is_mining: user.is_mining || false,
            referrals: user.referrals.length,
            referral_bonus: user.referral_bonus || 0
        }
    });
});

app.post('/api/logout', (req, res) => {
    const { username } = req.body;
    delete sessions[username];
    res.json({ status: 'success', message: 'Logged out' });
});

app.post('/api/mine', (req, res) => {
    const { username } = req.body;
    
    if (!username) {
        return res.json({ status: 'error', message: 'Please login first' });
    }
    
    const user = getUser(username);
    if (!user) {
        return res.json({ status: 'error', message: 'User not found' });
    }
    
    // Generate mining reward
    const rawEarned = Math.round((Math.random() * 0.004 + 0.001) * 1000000) / 1000000;
    
    // Apply 5% fee
    const fee = Math.round(rawEarned * FEE_RATE * 1000000) / 1000000;
    const earned = Math.round((rawEarned - fee) * 1000000) / 1000000;
    
    user.balance = Math.round((user.balance + earned) * 1000000) / 1000000;
    user.total_earned = Math.round((user.total_earned + earned) * 1000000) / 1000000;
    user.total_mined = Math.round((user.total_mined + earned) * 1000000) / 1000000;
    user.total_fees_paid = Math.round((user.total_fees_paid + fee) * 1000000) / 1000000;
    user.is_mining = true;
    
    transactions.push({
        username: username,
        type: 'mining',
        earned: earned,
        fee: fee,
        balance: user.balance,
        time: new Date().toISOString()
    });
    
    res.json({
        status: 'success',
        earned: earned,
        fee: fee,
        balance: user.balance,
        total_earned: user.total_earned,
        total_mined: user.total_mined,
        is_mining: true
    });
});

app.post('/api/stop_mining', (req, res) => {
    const { username } = req.body;
    const user = getUser(username);
    if (user) {
        user.is_mining = false;
    }
    res.json({ status: 'success', message: 'Mining stopped' });
});

app.post('/api/withdraw', (req, res) => {
    const { username, amount, wallet } = req.body;
    
    const user = getUser(username);
    if (!user) {
        return res.json({ status: 'error', message: 'Please login first' });
    }
    
    if (!wallet || wallet.length < 10) {
        return res.json({ status: 'error', message: 'Please enter a valid wallet address' });
    }
    
    if (amount < 1) {
        return res.json({ status: 'error', message: 'Minimum withdrawal is 1 USDT' });
    }
    
    // Apply 5% withdrawal fee
    const fee = Math.round(amount * FEE_RATE * 1000000) / 1000000;
    const netAmount = Math.round((amount - fee) * 1000000) / 1000000;
    
    if (user.balance < amount) {
        return res.json({ status: 'error', message: 'Insufficient balance. You have ' + user.balance.toFixed(6) + ' USDT' });
    }
    
    user.balance = Math.round((user.balance - amount) * 1000000) / 1000000;
    user.total_withdrawn = (user.total_withdrawn || 0) + netAmount;
    user.total_fees_paid = Math.round((user.total_fees_paid + fee) * 1000000) / 1000000;
    user.wallet = wallet;
    user.network = 'sol';
    
    const withdrawal = {
        id: Date.now().toString(),
        username: username,
        amount: amount,
        netAmount: netAmount,
        fee: fee,
        wallet: wallet,
        network: 'sol',
        time: new Date().toISOString(),
        status: 'pending'
    };
    withdrawals.push(withdrawal);
    
    transactions.push({
        username: username,
        type: 'withdrawal_request',
        amount: amount,
        fee: fee,
        netAmount: netAmount,
        wallet: wallet,
        time: new Date().toISOString()
    });
    
    res.json({
        status: 'success',
        message: 'Withdrawal request submitted! Amount: ' + amount.toFixed(2) + ' USDT (Fee: ' + fee.toFixed(2) + ' USDT, Net: ' + netAmount.toFixed(2) + ' USDT)',
        withdrawal_id: withdrawal.id,
        fee: fee,
        netAmount: netAmount
    });
});

app.get('/api/ads', (req, res) => {
    res.json({
        status: 'success',
        ads: [
            { title: 'Watch Video', desc: 'Watch 30-second ad to earn 0.005 USDT', reward: 0.005 },
            { title: 'Complete Survey', desc: 'Share your opinion and earn 0.02 USDT', reward: 0.02 },
            { title: 'Trade Crypto', desc: 'Start trading with $10 bonus', reward: 0.01 }
        ]
    });
});

app.post('/api/watch_ad', (req, res) => {
    const { username, ad_index } = req.body;
    
    const user = getUser(username);
    if (!user) {
        return res.json({ status: 'error', message: 'Please login first' });
    }
    
    const ads = [{ reward: 0.005 }, { reward: 0.02 }, { reward: 0.01 }];
    if (ad_index < 0 || ad_index >= ads.length) {
        return res.json({ status: 'error', message: 'Invalid ad' });
    }
    
    const reward = ads[ad_index].reward;
    const fee = Math.round(reward * FEE_RATE * 1000000) / 1000000;
    const netReward = Math.round((reward - fee) * 1000000) / 1000000;
    
    user.balance = Math.round((user.balance + netReward) * 1000000) / 1000000;
    user.total_earned = Math.round((user.total_earned + netReward) * 1000000) / 1000000;
    
    transactions.push({
        username: username,
        type: 'ad_watch',
        earned: netReward,
        fee: fee,
        balance: user.balance,
        time: new Date().toISOString()
    });
    
    res.json({
        status: 'success',
        reward: netReward,
        fee: fee,
        balance: user.balance
    });
});

app.get('/api/referral_info', (req, res) => {
    const { username } = req.query;
    
    const user = getUser(username);
    if (!user) {
        return res.json({ status: 'error', message: 'User not found' });
    }
    
    res.json({
        status: 'success',
        referral_code: user.referral_code,
        referrals: user.referrals.length,
        referral_bonus: Math.round((user.referral_bonus || 0) * 100) / 100
    });
});

app.get('/api/stats', (req, res) => {
    const total_users = Object.keys(users).length;
    const total_earned = Math.round(Object.values(users).reduce((sum, u) => sum + u.total_earned, 0) * 100) / 100;
    const total_withdrawn = Math.round(withdrawals.filter(w => w.status === 'completed').reduce((sum, w) => sum + w.netAmount, 0) * 100) / 100;
    const total_fees = Math.round(Object.values(users).reduce((sum, u) => sum + (u.total_fees_paid || 0), 0) * 100) / 100;
    
    res.json({
        total_users: total_users,
        total_earned: total_earned,
        total_withdrawn: total_withdrawn,
        total_fees: total_fees
    });
});

app.get('/api/leaderboard', (req, res) => {
    const sorted = Object.entries(users)
        .sort((a, b) => b[1].total_earned - a[1].total_earned)
        .slice(0, 10)
        .map(([username, data]) => ({
            username: username,
            total_earned: Math.round(data.total_earned * 100) / 100,
            referrals: data.referrals.length
        }));
    res.json(sorted);
});

app.get('/api/check_session', (req, res) => {
    const { username } = req.query;
    
    if (!username) {
        return res.json({ status: 'error', message: 'No username provided' });
    }
    
    const isLoggedIn = sessions[username] || false;
    const user = getUser(username);
    
    if (!user) {
        return res.json({ 
            status: 'error', 
            message: 'User not found',
            logged_in: false 
        });
    }
    
    res.json({
        status: 'success',
        logged_in: isLoggedIn,
        user: {
            username: username,
            balance: user.balance,
            total_earned: user.total_earned,
            total_mined: user.total_mined,
            is_mining: user.is_mining || false,
            referrals: user.referrals.length,
            referral_bonus: Math.round((user.referral_bonus || 0) * 100) / 100
        }
    });
});

app.get('/api/transactions', (req, res) => {
    const { username } = req.query;
    const userTransactions = transactions.filter(t => t.username === username).slice(-50);
    res.json({ status: 'success', transactions: userTransactions });
});

module.exports = app;
