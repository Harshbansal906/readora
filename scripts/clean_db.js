const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./readora.db');

db.serialize(() => {
  db.run("DELETE FROM users WHERE email LIKE 'audit_%' OR email LIKE 'tester_%' OR email LIKE 'verified_creator_%' OR email = 'testuser@gmail.com' OR email LIKE '%test.google%'");
  db.run("DELETE FROM posts WHERE author_name = 'Audit Test User' OR title = 'bjabjas' OR author_name = 'Test User'");
  
  db.all('SELECT id, author_name, title, type, category FROM posts', (err, rows) => {
    if (err) console.error(err);
    else console.log('REMAINING POSTS (' + rows.length + '):', rows);
  });
  
  db.all('SELECT id, name, email, handle FROM users', (err, rows) => {
    if (err) console.error(err);
    else console.log('REMAINING REAL USERS (' + rows.length + '):', rows);
  });
  
  db.close();
});
