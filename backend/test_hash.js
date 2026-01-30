const bcrypt = require('bcryptjs');
const password = '1343';
const salt = bcrypt.genSaltSync(10);
const hash = bcrypt.hashSync(password, salt);
console.log('Password: ' + password);
console.log('Hash: ' + hash);
console.log('Verify: ' + bcrypt.compareSync(password, hash));
