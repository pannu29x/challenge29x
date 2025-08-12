const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const { Low, JSONFile } = require('lowdb');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const fs = require('fs');
const multer = require('multer');

const app = express();
app.use(cors());
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));

const SECRET = process.env.JWT_SECRET || 'devsecret';
const dbFile = path.join(__dirname, 'db.json');
const adapter = new JSONFile(dbFile);
const db = new Low(adapter);

const UPLOADS_DIR = path.join(__dirname, 'public', 'uploads');
if(!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, UPLOADS_DIR);
  },
  filename: function (req, file, cb) {
    const id = uuidv4();
    const ext = path.extname(file.originalname) || '.jpg';
    cb(null, id + ext);
  }
});
const upload = multer({ storage, limits: { fileSize: 5 * 1024 * 1024 } }); // 5MB limit

async function initDB() {
  await db.read();
  db.data = db.data || { users: [], withdraws: [], games: [], challenges: [], photos: [], seedDone:false };
  if(!db.data.seedDone){
    // create an admin
    const adminPass = bcrypt.hashSync('admin123', 8);
    db.data.users.push({id: 'admin', email: 'admin@example.com', password: adminPass, role:'admin', credits: 0, name:'Administrator'});
    // sample user
    const userPass = bcrypt.hashSync('user123', 8);
    db.data.users.push({id: uuidv4(), email: 'user@example.com', password: userPass, role:'user', credits: 1000, name:'Demo User'});
    // sample games (placeholders)
    for(let i=1;i<=10;i++){
      db.data.games.push({id: 'game-'+i, title: 'Mini Game '+i, description: 'Placeholder mini-game', route: '/games/game-'+i});
    }
    // sample challenge
    const cId = 'challenge-1';
    db.data.challenges.push({id:cId, title:'Best Sunset', description:'Upload your best sunset photo', createdBy:'admin', createdAt: new Date().toISOString(), open:true});
    // sample photos
    db.data.photos.push({id: uuidv4(), challengeId: cId, userId: db.data.users[1].id, filename: '', url: '', title:'Demo Photo', votes: 0, createdAt: new Date().toISOString(), placeholder:true});
    db.data.seedDone = true;
    await db.write();
  }
}

initDB();

function authMiddleware(req, res, next){
  const auth = req.headers.authorization;
  if(!auth) return res.status(401).json({error:'Missing token'});
  const token = auth.replace('Bearer ',''); 
  try{
    const payload = jwt.verify(token, SECRET);
    req.user = payload;
    next();
  } catch(e){
    return res.status(401).json({error:'Invalid token'});
  }
}

function adminOnly(req,res,next){
  if(req.user.role !== 'admin') return res.status(403).json({error:'Admin only'});
  next();
}

// Auth endpoints
app.post('/api/signup', async (req, res) => {
  const {email, password, name} = req.body;
  await db.read();
  if(db.data.users.find(u=>u.email===email)) return res.status(400).json({error:'Email exists'});
  const hashed = bcrypt.hashSync(password,8);
  const user = {id: uuidv4(), email, password: hashed, role:'user', credits: 500, name: name||'Player'};
  db.data.users.push(user);
  await db.write();
  const token = jwt.sign({id: user.id, email: user.email, role:user.role, name:user.name}, SECRET, {expiresIn:'7d'});
  res.json({token, user:{id:user.id, email:user.email, credits:user.credits, name:user.name}});
});

app.post('/api/login', async (req,res)=>{
  const {email, password} = req.body;
  await db.read();
  const user = db.data.users.find(u=>u.email===email);
  if(!user) return res.status(400).json({error:'Invalid credentials'});
  if(!bcrypt.compareSync(password, user.password)) return res.status(400).json({error:'Invalid credentials'});
  const token = jwt.sign({id: user.id, email: user.email, role:user.role, name:user.name}, SECRET, {expiresIn:'7d'});
  res.json({token, user:{id:user.id, email:user.email, credits:user.credits, name:user.name}});
});

app.get('/api/profile', authMiddleware, async (req,res)=>{
  await db.read();
  const user = db.data.users.find(u=>u.id===req.user.id);
  if(!user) return res.status(404).json({error:'Not found'});
  res.json({id:user.id, email:user.email, credits:user.credits, name:user.name});
});

// wallet endpoints (virtual credits)
app.get('/api/wallet', authMiddleware, async (req,res)=>{
  await db.read();
  const user = db.data.users.find(u=>u.id===req.user.id);
  res.json({credits: user ? user.credits : 0});
});

// deposit virtual credits (admin can also adjust)
app.post('/api/wallet/deposit', authMiddleware, async (req,res)=>{
  const {amount, note} = req.body;
  if(amount<=0) return res.status(400).json({error:'Invalid amount'});
  await db.read();
  const user = db.data.users.find(u=>u.id===req.user.id);
  user.credits += Number(amount);
  await db.write();
  res.json({ok:true, credits: user.credits});
});

// withdraw request: user requests to withdraw virtual credits (for demo only, no real money)
app.post('/api/wallet/withdraw', authMiddleware, async (req,res)=>{
  const {amount, upi, utr} = req.body;
  if(amount<=0) return res.status(400).json({error:'Invalid amount'});
  await db.read();
  const user = db.data.users.find(u=>u.id===req.user.id);
  if(user.credits < amount) return res.status(400).json({error:'Insufficient credits'});
  const w = {id: uuidv4(), userId: user.id, amount: Number(amount), upi: upi||'', utr: utr||'', status: 'pending', createdAt: new Date().toISOString()};
  db.data.withdraws.push(w);
  // For demo we do not deduct credits until admin approves
  await db.write();
  res.json({ok:true, request: w});
});

// admin: list withdraw requests
app.get('/api/admin/withdraws', authMiddleware, adminOnly, async (req,res)=>{
  await db.read();
  res.json(db.data.withdraws);
});

// admin: approve/reject
app.post('/api/admin/withdraws/:id/:action', authMiddleware, adminOnly, async (req,res)=>{
  const {id, action} = req.params;
  await db.read();
  const w = db.data.withdraws.find(x=>x.id===id);
  if(!w) return res.status(404).json({error:'Not found'});
  if(!['approve','reject'].includes(action)) return res.status(400).json({error:'Bad action'});
  w.status = action === 'approve' ? 'approved' : 'rejected';
  w.processedAt = new Date().toISOString();
  if(w.status === 'approved'){
    const user = db.data.users.find(u=>u.id===w.userId);
    if(user){
      user.credits -= w.amount;
    }
  }
  await db.write();
  res.json({ok:true, request: w});
});

// games list
app.get('/api/games', async (req,res)=>{
  await db.read();
  res.json(db.data.games);
});

// --- Photo-challenge module ---

// create a challenge
app.post('/api/challenges', authMiddleware, async (req, res) => {
  const { title, description, open } = req.body;
  if(!title) return res.status(400).json({error:'Missing title'});
  await db.read();
  const c = { id: uuidv4(), title, description: description||'', createdBy: req.user.id, createdAt: new Date().toISOString(), open: open===false ? false : true };
  db.data.challenges.push(c);
  await db.write();
  res.json({ok:true, challenge:c});
});

// list challenges
app.get('/api/challenges', async (req, res) => {
  await db.read();
  res.json(db.data.challenges);
});

// get challenge details + photos
app.get('/api/challenges/:id', async (req, res) => {
  const id = req.params.id;
  await db.read();
  const c = db.data.challenges.find(x=>x.id===id);
  if(!c) return res.status(404).json({error:'Not found'});
  const photos = db.data.photos.filter(p=>p.challengeId===id);
  res.json({challenge:c, photos});
});

// upload a photo to a challenge (multipart/form-data)
app.post('/api/challenges/:id/upload', authMiddleware, upload.single('photo'), async (req, res) => {
  const id = req.params.id;
  await db.read();
  const c = db.data.challenges.find(x=>x.id===id);
  if(!c) return res.status(404).json({error:'Challenge not found'});
  if(!req.file) return res.status(400).json({error:'Missing file'});
  const url = '/uploads/' + req.file.filename;
  const p = { id: uuidv4(), challengeId: id, userId: req.user.id, filename: req.file.filename, url, title: req.body.title||'', votes: 0, createdAt: new Date().toISOString() };
  db.data.photos.push(p);
  await db.write();
  res.json({ok:true, photo:p});
});

// vote for a photo (costs credits)
app.post('/api/challenges/:id/photos/:photoId/vote', authMiddleware, async (req, res) => {
  const costPerVote = 10; // credits
  const { amount } = req.body; // number of votes to cast (optional)
  const votes = Math.max(1, Number(amount) || 1);
  await db.read();
  const photo = db.data.photos.find(p => p.id === req.params.photoId && p.challengeId === req.params.id);
  if(!photo) return res.status(404).json({error:'Photo not found'});
  const user = db.data.users.find(u => u.id === req.user.id);
  const totalCost = votes * costPerVote;
  if(user.credits < totalCost) return res.status(400).json({error:'Insufficient credits'});
  user.credits -= totalCost;
  photo.votes = (photo.votes || 0) + votes;
  // save a vote record
  db.data.photos = db.data.photos.map(p => p.id === photo.id ? photo : p);
  db.data.users = db.data.users.map(u => u.id === user.id ? user : u);
  await db.write();
  res.json({ok:true, photo, credits: user.credits});
});

// admin: list all photos (for moderation)
app.get('/api/admin/photos', authMiddleware, adminOnly, async (req, res) => {
  await db.read();
  res.json(db.data.photos);
});

// admin: remove a photo
app.delete('/api/admin/photos/:id', authMiddleware, adminOnly, async (req, res) => {
  const id = req.params.id;
  await db.read();
  const idx = db.data.photos.findIndex(p => p.id === id);
  if(idx === -1) return res.status(404).json({error:'Not found'});
  const removed = db.data.photos.splice(idx,1)[0];
  // delete file if exists
  try{ fs.unlinkSync(path.join(UPLOADS_DIR, removed.filename)); }catch(e){}
  await db.write();
  res.json({ok:true});
});

// admin: close/open challenge
app.post('/api/admin/challenges/:id/:action', authMiddleware, adminOnly, async (req, res) => {
  const {id, action} = req.params;
  await db.read();
  const c = db.data.challenges.find(x=>x.id===id);
  if(!c) return res.status(404).json({error:'Not found'});
  if(action === 'close') c.open = false;
  if(action === 'open') c.open = true;
  await db.write();
  res.json({ok:true, challenge: c});
});


// --- Game play endpoint (deduct credits and award winnings) ---
// Expected body: { gameId: string, cost: number, playSeed?: any }
app.post('/api/play', authMiddleware, async (req, res) => {
  const { gameId, cost, result } = req.body;
  if(!gameId || typeof cost !== 'number') return res.status(400).json({error:'Missing params'});
  await db.read();
  const user = db.data.users.find(u => u.id === req.user.id);
  if(!user) return res.status(404).json({error:'User not found'});
  if(user.credits < cost) return res.status(400).json({error:'Insufficient credits'});
  // deduct cost
  user.credits -= cost;
  // result is the credits to award (0 or positive)
  const award = Number(result) || 0;
  if(award > 0) user.credits += award;
  // record a simple game play log
  db.data.games = db.data.games || [];
  db.data.gamePlays = db.data.gamePlays || [];
  const play = { id: uuidv4(), userId: user.id, gameId, cost, award, createdAt: new Date().toISOString() };
  db.data.gamePlays.push(play);
  // update user in db
  db.data.users = db.data.users.map(u => u.id === user.id ? user : u);
  await db.write();
  res.json({ok:true, credits: user.credits, play});
});

const PORT = process.env.PORT || 4000;

// --- Secure Game play endpoint and admin game config endpoints ---
// Server determines outcome using secure RNG and applies 5% fee as configured per game
app.post('/api/play', authMiddleware, async (req, res) => {
  const { gameId } = req.body;
  if(!gameId) return res.status(400).json({error:'Missing gameId'});
  await db.read();
  const cfg = db.data.gameConfigs && db.data.gameConfigs[gameId];
  if(!cfg) return res.status(404).json({error:'Game config not found'});
  if(!cfg.enabled) return res.status(400).json({error:'Game is disabled'});
  const user = db.data.users.find(u => u.id === req.user.id);
  if(!user) return res.status(404).json({error:'User not found'});
  const cost = Number(cfg.cost) || 0;
  if(user.credits < cost) return res.status(400).json({error:'Insufficient credits'});
  // apply fee
  const feePercent = Number(cfg.feePercent || 0);
  const fee = Math.floor((cost * feePercent) / 100); // integer credits fee
  const effectiveStake = cost - fee;
  // deduct cost (including fee)
  user.credits -= cost;
  // determine outcome using secure RNG (Math.random is okay for demo, crypto recommended in prod)
  const rnd = Math.random();
  // choose multiplier based on odds array
  const odds = cfg.odds || [];
  const multipliers = cfg.payoutMultipliers || [];
  let cumulative = 0;
  let chosenMultiplier = 0;
  for(let i=0;i<odds.length;i++){
    cumulative += Number(odds[i]) || 0;
    if(rnd <= cumulative){
      chosenMultiplier = Number(multipliers[i]) || 0;
      break;
    }
  }
  // calculate award = floor(effectiveStake * multiplier)
  const award = Math.floor(effectiveStake * chosenMultiplier);
  if(award > 0) user.credits += award;
  // track system fee collected for reporting
  db.data.systemFees = db.data.systemFees || [];
  db.data.systemFees.push({id: uuidv4(), gameId, fee, collectedAt: new Date().toISOString()});
  // record play
  db.data.gamePlays = db.data.gamePlays || [];
  const play = { id: uuidv4(), userId: user.id, gameId, cost, fee, effectiveStake, multiplier: chosenMultiplier, award, createdAt: new Date().toISOString() };
  db.data.gamePlays.push(play);
  // persist user changes
  db.data.users = db.data.users.map(u => u.id === user.id ? user : u);
  await db.write();
  res.json({ok:true, credits: user.credits, play});
});

// Admin: list all game configs
app.get('/api/admin/games', authMiddleware, adminOnly, async (req, res) => {
  await db.read();
  res.json(db.data.gameConfigs || {});
});

// Admin: update a game config (partial update)
app.put('/api/admin/games/:gameId', authMiddleware, adminOnly, async (req, res) => {
  const { gameId } = req.params;
  const payload = req.body;
  await db.read();
  db.data.gameConfigs = db.data.gameConfigs || {};
  const cur = db.data.gameConfigs[gameId];
  if(!cur) return res.status(404).json({error:'Game not found'});
  // Allowed fields to update: cost, feePercent, payoutMultipliers, odds, enabled
  if(payload.cost !== undefined) cur.cost = Number(payload.cost);
  if(payload.feePercent !== undefined) cur.feePercent = Number(payload.feePercent);
  if(payload.payoutMultipliers !== undefined) cur.payoutMultipliers = payload.payoutMultipliers;
  if(payload.odds !== undefined) cur.odds = payload.odds;
  if(payload.enabled !== undefined) cur.enabled = !!payload.enabled;
  db.data.gameConfigs[gameId] = cur;
  await db.write();
  res.json({ok:true, gameConfig: cur});
});

// Public endpoint: get game config (safe subset) by id
app.get('/api/gameconfig/:gameId', async (req, res) => {
  const gameId = req.params.gameId;
  await db.read();
  const cfg = db.data.gameConfigs && db.data.gameConfigs[gameId];
  if(!cfg) return res.status(404).json({error:'Not found'});
  // return safe subset
  const safe = { gameId: cfg.gameId, cost: cfg.cost, payoutMultipliers: cfg.payoutMultipliers, enabled: cfg.enabled };
  res.json(safe);
});
app.listen(PORT, ()=> console.log('Server running on', PORT));
