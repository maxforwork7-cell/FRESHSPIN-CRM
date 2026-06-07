/**
 * FreshSpin CRM — Node.js Server with PostgreSQL
 * Run: node freshspin-server.js
 */

const http = require("http");
const fs   = require("fs");
const path = require("path");
const { Pool } = require("pg");

const PORT      = process.env.PORT || 3000;
const HTML_FILE = path.join(__dirname, "FreshSpin_CRM_v2.html");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false,
});

// ─── INIT DB ─────────────────────────────────────────────────────────────────
async function initDB() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'employee',
      email TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      pin TEXT DEFAULT '',
      phone TEXT DEFAULT '',
      avatar TEXT DEFAULT '',
      active BOOLEAN DEFAULT true,
      created_at TEXT DEFAULT '',
      permissions JSONB DEFAULT '[]'
    );
    CREATE TABLE IF NOT EXISTS clients (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      phone TEXT DEFAULT '',
      email TEXT DEFAULT '',
      address TEXT DEFAULT '',
      join_date TEXT DEFAULT '',
      loyalty INTEGER DEFAULT 0,
      notes TEXT DEFAULT ''
    );
    CREATE TABLE IF NOT EXISTS invoices (
      id TEXT PRIMARY KEY,
      client_id INTEGER DEFAULT 0,
      client_name TEXT DEFAULT '',
      services JSONB DEFAULT '[]',
      total NUMERIC DEFAULT 0,
      date TEXT DEFAULT '',
      status TEXT DEFAULT 'pending',
      created_by TEXT DEFAULT '',
      notes TEXT DEFAULT ''
    );
    CREATE TABLE IF NOT EXISTS expenses (
      id SERIAL PRIMARY KEY,
      category TEXT DEFAULT '',
      description TEXT DEFAULT '',
      amount NUMERIC DEFAULT 0,
      date TEXT DEFAULT '',
      created_by TEXT DEFAULT '',
      proof TEXT DEFAULT ''
    );
    CREATE TABLE IF NOT EXISTS shifts (
      id SERIAL PRIMARY KEY,
      employee_id INTEGER DEFAULT 0,
      employee_name TEXT DEFAULT '',
      date TEXT DEFAULT '',
      start_time TEXT DEFAULT '',
      end_time TEXT DEFAULT '',
      hours NUMERIC DEFAULT 0,
      status TEXT DEFAULT 'scheduled'
    );
    CREATE TABLE IF NOT EXISTS subscriptions (
      id SERIAL PRIMARY KEY,
      client_id INTEGER DEFAULT 0,
      client_name TEXT DEFAULT '',
      plan TEXT DEFAULT '',
      amount NUMERIC DEFAULT 0,
      start_date TEXT DEFAULT '',
      expiration TEXT DEFAULT '',
      status TEXT DEFAULT 'active'
    );
    CREATE TABLE IF NOT EXISTS hr_config (
      id INTEGER PRIMARY KEY DEFAULT 1,
      hourly_rate NUMERIC DEFAULT 85,
      overtime_multiplier NUMERIC DEFAULT 1.5,
      pay_period TEXT DEFAULT 'biweekly'
    );
    CREATE TABLE IF NOT EXISTS deliveries (
      id SERIAL PRIMARY KEY,
      driver_id INTEGER DEFAULT 0,
      driver_name TEXT DEFAULT '',
      date TEXT DEFAULT '',
      qty INTEGER DEFAULT 1,
      notes TEXT DEFAULT '',
      recorded_by TEXT DEFAULT ''
    );
  `);

  // Add permissions column if missing (for existing DBs)
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS permissions JSONB DEFAULT '[]'`);

  // Seed admin user if no users exist
  const { rows } = await pool.query("SELECT COUNT(*) FROM users");
  if (parseInt(rows[0].count) === 0) {
    await pool.query(
      `INSERT INTO users(name,role,email,password,pin,phone,avatar,active,created_at,permissions)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      ["Max","manager","maxforwork7@gmail.com","Fresh1234","1234","","MX",true,"2026-01-01","[]"]
    );
  }

  await pool.query(`INSERT INTO hr_config(id,hourly_rate,overtime_multiplier,pay_period)VALUES(1,85,1.5,'biweekly')ON CONFLICT(id)DO NOTHING`);
  console.log("✅ Database ready");
}

// ─── LOAD ALL DATA ────────────────────────────────────────────────────────────
async function loadAllData() {
  const [u,c,i,e,s,sub,hr,d] = await Promise.all([
    pool.query("SELECT * FROM users ORDER BY id"),
    pool.query("SELECT * FROM clients ORDER BY id"),
    pool.query("SELECT * FROM invoices ORDER BY date DESC"),
    pool.query("SELECT * FROM expenses ORDER BY id DESC"),
    pool.query("SELECT * FROM shifts ORDER BY id"),
    pool.query("SELECT * FROM subscriptions ORDER BY id"),
    pool.query("SELECT * FROM hr_config WHERE id=1"),
    pool.query("SELECT * FROM deliveries ORDER BY id DESC"),
  ]);
  return {
    users:         u.rows.map(r=>({id:r.id,name:r.name,role:r.role,email:r.email,password:r.password,pin:r.pin||"",phone:r.phone||"",avatar:r.avatar||"",active:r.active,createdAt:r.created_at||"",permissions:r.permissions||[]})),
    clients:       c.rows.map(r=>({id:r.id,name:r.name,phone:r.phone||"",email:r.email||"",address:r.address||"",joinDate:r.join_date||"",loyalty:Number(r.loyalty)||0,notes:r.notes||""})),
    invoices:      i.rows.map(r=>({id:r.id,clientId:r.client_id,clientName:r.client_name,services:r.services||[],total:Number(r.total),date:r.date,status:r.status,createdBy:r.created_by,notes:r.notes||""})),
    expenses:      e.rows.map(r=>({id:r.id,category:r.category,description:r.description,amount:Number(r.amount),date:r.date,createdBy:r.created_by,proof:r.proof||""})),
    shifts:        s.rows.map(r=>({id:r.id,employeeId:r.employee_id,employeeName:r.employee_name,date:r.date,start:r.start_time,end:r.end_time,hours:Number(r.hours),status:r.status})),
    subscriptions: sub.rows.map(r=>({id:r.id,clientId:r.client_id,clientName:r.client_name,plan:r.plan,amount:Number(r.amount),startDate:r.start_date,expiration:r.expiration,status:r.status})),
    hrConfig:      hr.rows[0]?{hourlyRate:Number(hr.rows[0].hourly_rate),overtimeMultiplier:Number(hr.rows[0].overtime_multiplier),payPeriod:hr.rows[0].pay_period}:{hourlyRate:85,overtimeMultiplier:1.5,payPeriod:"biweekly"},
    deliveries:    d.rows.map(r=>({id:r.id,driverId:r.driver_id,driverName:r.driver_name,date:r.date,qty:Number(r.qty),notes:r.notes||"",recordedBy:r.recorded_by||""})),
  };
}

// ─── API HANDLER ──────────────────────────────────────────────────────────────
async function handleAPI(req, res, body) {
  const url=req.url, method=req.method;

  // GET all data
  if(url==="/api/data"&&method==="GET"){
    const data=await loadAllData();
    res.writeHead(200,{"Content-Type":"application/json"});
    res.end(JSON.stringify(data));return;
  }

  // ── USERS ──────────────────────────────────────────────────────────────────
  if(url==="/api/users"&&method==="POST"){
    const u=body;
    const r=await pool.query(
      `INSERT INTO users(name,role,email,password,pin,phone,avatar,active,created_at,permissions)VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)RETURNING id`,
      [u.name,u.role||"employee",u.email,u.password,u.pin||"",u.phone||"",u.avatar||initials(u.name),u.active!==false,u.createdAt||today(),JSON.stringify(u.permissions||[])]
    );
    res.writeHead(200,{"Content-Type":"application/json"});res.end(JSON.stringify({id:r.rows[0].id}));return;
  }
  if(url.startsWith("/api/users/")&&method==="PUT"){
    const id=url.split("/")[3],u=body;
    await pool.query(
      `UPDATE users SET name=$1,role=$2,email=$3,password=$4,pin=$5,phone=$6,avatar=$7,permissions=$8 WHERE id=$9`,
      [u.name,u.role,u.email,u.password,u.pin||"",u.phone||"",u.avatar||"",JSON.stringify(u.permissions||[]),id]
    );
    res.writeHead(200,{"Content-Type":"application/json"});res.end(JSON.stringify({ok:true}));return;
  }
  if(url.startsWith("/api/users/")&&method==="PATCH"){
    const id=url.split("/")[3];
    await pool.query(`UPDATE users SET active=NOT active WHERE id=$1`,[id]);
    res.writeHead(200,{"Content-Type":"application/json"});res.end(JSON.stringify({ok:true}));return;
  }

  // ── CLIENTS ────────────────────────────────────────────────────────────────
  if(url==="/api/clients"&&method==="POST"){
    const c=body;
    const r=await pool.query(
      `INSERT INTO clients(name,phone,email,address,join_date,loyalty,notes)VALUES($1,$2,$3,$4,$5,$6,$7)RETURNING id`,
      [c.name,c.phone||"",c.email||"",c.address||"",c.joinDate||today(),c.loyalty||0,c.notes||""]
    );
    res.writeHead(200,{"Content-Type":"application/json"});res.end(JSON.stringify({id:r.rows[0].id}));return;
  }
  if(url.startsWith("/api/clients/")&&method==="PUT"){
    const id=url.split("/")[3],c=body;
    await pool.query(
      `UPDATE clients SET name=$1,phone=$2,email=$3,address=$4,join_date=$5,loyalty=$6,notes=$7 WHERE id=$8`,
      [c.name,c.phone||"",c.email||"",c.address||"",c.joinDate||"",c.loyalty||0,c.notes||"",id]
    );
    res.writeHead(200,{"Content-Type":"application/json"});res.end(JSON.stringify({ok:true}));return;
  }
  if(url.startsWith("/api/clients/")&&method==="DELETE"){
    const id=url.split("/")[3];
    await pool.query(`DELETE FROM clients WHERE id=$1`,[id]);
    res.writeHead(200,{"Content-Type":"application/json"});res.end(JSON.stringify({ok:true}));return;
  }

  // ── INVOICES ───────────────────────────────────────────────────────────────
  if(url==="/api/invoices"&&method==="POST"){
    const i=body;
    await pool.query(
      `INSERT INTO invoices(id,client_id,client_name,services,total,date,status,created_by,notes)VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [i.id,i.clientId||0,i.clientName||"",JSON.stringify(i.services||[]),i.total||0,i.date||today(),i.status||"pending",i.createdBy||"",i.notes||""]
    );
    res.writeHead(200,{"Content-Type":"application/json"});res.end(JSON.stringify({ok:true}));return;
  }
  if(url.startsWith("/api/invoices/")&&method==="PATCH"){
    const id=url.split("/")[3];
    const {status,clientId,loyaltyGain}=body;
    await pool.query(`UPDATE invoices SET status=$1 WHERE id=$2`,[status,id]);
    if(loyaltyGain>0&&clientId) await pool.query(`UPDATE clients SET loyalty=loyalty+$1 WHERE id=$2`,[loyaltyGain,clientId]);
    res.writeHead(200,{"Content-Type":"application/json"});res.end(JSON.stringify({ok:true}));return;
  }
  if(url.startsWith("/api/invoices/")&&method==="DELETE"){
    const id=url.split("/")[3];
    await pool.query(`DELETE FROM invoices WHERE id=$1`,[id]);
    res.writeHead(200,{"Content-Type":"application/json"});res.end(JSON.stringify({ok:true}));return;
  }

  // ── EXPENSES ───────────────────────────────────────────────────────────────
  if(url==="/api/expenses"&&method==="POST"){
    const e=body;
    const r=await pool.query(
      `INSERT INTO expenses(category,description,amount,date,created_by,proof)VALUES($1,$2,$3,$4,$5,$6)RETURNING id`,
      [e.category||"",e.description||"",e.amount||0,e.date||today(),e.createdBy||"",e.proof||""]
    );
    res.writeHead(200,{"Content-Type":"application/json"});res.end(JSON.stringify({id:r.rows[0].id}));return;
  }
  if(url.startsWith("/api/expenses/")&&method==="DELETE"){
    const id=url.split("/")[3];
    await pool.query(`DELETE FROM expenses WHERE id=$1`,[id]);
    res.writeHead(200,{"Content-Type":"application/json"});res.end(JSON.stringify({ok:true}));return;
  }

  // ── SHIFTS ─────────────────────────────────────────────────────────────────
  if(url==="/api/shifts"&&method==="POST"){
    const s=body;
    const r=await pool.query(
      `INSERT INTO shifts(employee_id,employee_name,date,start_time,end_time,hours,status)VALUES($1,$2,$3,$4,$5,$6,$7)RETURNING id`,
      [s.employeeId||0,s.employeeName||"",s.date||today(),s.start||"",s.end||"",s.hours||0,s.status||"scheduled"]
    );
    res.writeHead(200,{"Content-Type":"application/json"});res.end(JSON.stringify({id:r.rows[0].id}));return;
  }
  if(url.startsWith("/api/shifts/")&&method==="PUT"){
    const id=url.split("/")[3],s=body;
    await pool.query(
      `UPDATE shifts SET employee_id=$1,employee_name=$2,date=$3,start_time=$4,end_time=$5,hours=$6,status=$7 WHERE id=$8`,
      [s.employeeId||0,s.employeeName||"",s.date||"",s.start||"",s.end||"",s.hours||0,s.status||"scheduled",id]
    );
    res.writeHead(200,{"Content-Type":"application/json"});res.end(JSON.stringify({ok:true}));return;
  }
  if(url.startsWith("/api/shifts/")&&method==="DELETE"){
    const id=url.split("/")[3];
    await pool.query(`DELETE FROM shifts WHERE id=$1`,[id]);
    res.writeHead(200,{"Content-Type":"application/json"});res.end(JSON.stringify({ok:true}));return;
  }

  // ── SUBSCRIPTIONS ──────────────────────────────────────────────────────────
  if(url==="/api/subscriptions"&&method==="POST"){
    const s=body;
    const r=await pool.query(
      `INSERT INTO subscriptions(client_id,client_name,plan,amount,start_date,expiration,status)VALUES($1,$2,$3,$4,$5,$6,$7)RETURNING id`,
      [s.clientId||0,s.clientName||"",s.plan||"",s.amount||0,s.startDate||today(),s.expiration||"",s.status||"active"]
    );
    res.writeHead(200,{"Content-Type":"application/json"});res.end(JSON.stringify({id:r.rows[0].id}));return;
  }
  if(url.startsWith("/api/subscriptions/")&&method==="PUT"){
    const id=url.split("/")[3],s=body;
    await pool.query(
      `UPDATE subscriptions SET client_id=$1,client_name=$2,plan=$3,amount=$4,start_date=$5,expiration=$6,status=$7 WHERE id=$8`,
      [s.clientId||0,s.clientName||"",s.plan||"",s.amount||0,s.startDate||"",s.expiration||"",s.status||"active",id]
    );
    res.writeHead(200,{"Content-Type":"application/json"});res.end(JSON.stringify({ok:true}));return;
  }

  // ── HR CONFIG ──────────────────────────────────────────────────────────────
  if(url==="/api/hrconfig"&&method==="PUT"){
    const cfg=body;
    await pool.query(
      `UPDATE hr_config SET hourly_rate=$1,overtime_multiplier=$2,pay_period=$3 WHERE id=1`,
      [cfg.hourlyRate||85,cfg.overtimeMultiplier||1.5,cfg.payPeriod||"biweekly"]
    );
    res.writeHead(200,{"Content-Type":"application/json"});res.end(JSON.stringify({ok:true}));return;
  }

  // ── DELIVERIES ─────────────────────────────────────────────────────────────
  if(url==="/api/deliveries"&&method==="POST"){
    const d=body;
    const r=await pool.query(
      `INSERT INTO deliveries(driver_id,driver_name,date,qty,notes,recorded_by)VALUES($1,$2,$3,$4,$5,$6)RETURNING id`,
      [d.driverId||0,d.driverName||"",d.date||today(),d.qty||1,d.notes||"",d.recordedBy||""]
    );
    res.writeHead(200,{"Content-Type":"application/json"});res.end(JSON.stringify({id:r.rows[0].id}));return;
  }
  if(url.startsWith("/api/deliveries/")&&method==="DELETE"){
    const id=url.split("/")[3];
    await pool.query(`DELETE FROM deliveries WHERE id=$1`,[id]);
    res.writeHead(200,{"Content-Type":"application/json"});res.end(JSON.stringify({ok:true}));return;
  }

  res.writeHead(404,{"Content-Type":"application/json"});
  res.end(JSON.stringify({error:"Not found"}));
}

// ─── HELPERS ──────────────────────────────────────────────────────────────────
function today(){ return new Date().toISOString().split("T")[0]; }
function initials(name){ return (name||"?").split(" ").map(w=>w[0]).slice(0,2).join("").toUpperCase(); }

// ─── HTTP SERVER ──────────────────────────────────────────────────────────────
const server = http.createServer((req,res)=>{
  res.setHeader("Access-Control-Allow-Origin","*");
  res.setHeader("Access-Control-Allow-Methods","GET,POST,PUT,PATCH,DELETE,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers","Content-Type");
  if(req.method==="OPTIONS"){res.writeHead(204);res.end();return;}

  if(req.url.startsWith("/api/")){
    let body="";
    req.on("data",chunk=>body+=chunk);
    req.on("end",()=>{
      try{
        const parsed=body?JSON.parse(body):{};
        handleAPI(req,res,parsed).catch(err=>{
          console.error("API Error:",err.message);
          if(!res.headersSent){
            res.writeHead(500,{"Content-Type":"application/json"});
            res.end(JSON.stringify({error:err.message}));
          }
        });
      }catch(e){
        res.writeHead(400,{"Content-Type":"application/json"});
        res.end(JSON.stringify({error:"Invalid JSON"}));
      }
    });
    return;
  }

  fs.readFile(HTML_FILE,(err,data)=>{
    if(err){res.writeHead(404,{"Content-Type":"text/plain"});res.end("404 — FreshSpin_CRM_v2.html not found.");return;}
    res.writeHead(200,{"Content-Type":"text/html; charset=utf-8","Cache-Control":"no-cache"});
    res.end(data);
  });
});

server.listen(PORT,"0.0.0.0",async()=>{
  console.log(`🧺 FreshSpin CRM running on port ${PORT}`);
  await initDB();
});

server.on("error",err=>{
  if(err.code==="EADDRINUSE") console.error(`Port ${PORT} already in use.`);
  else console.error("Server error:",err);
  process.exit(1);
});
