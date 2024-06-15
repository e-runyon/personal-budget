const express = require('express');
const cors = require('cors');
const sqlite3 = require('sqlite3');
const PORT = process.env.PORT || 3000;

const app = express();
const db = new sqlite3.Database('./envelopes.sqlite');

let envelopes = [];

function checkForError(err) {
    return () => {
        if (err) {
            console.error(err);
            console.log("Something went wrong...");
            return err;
        }
    }
};

function validatePost(req, res, next) {
    if (Object.hasOwn(req.body, 'category') && Object.hasOwn(req.body, 'amount')) {
        const { category, amount } = req.body;
        if (typeof category === 'string' && typeof amount === 'number') return next();
        res.status(400).send("Category and amount must be a string and number respectively");
    }
}

function checkBalance(req, res, next) {
    console.log(`Requesting transfer of $${req.body.amount}`)
    if (typeof req.body.amount !== "number") return next(new Error("Invalid transfer request: amount must be a number"));
    db.get(`SELECT amount FROM envelopes WHERE envelopes.id = ${req.params.from}`, (err, selected) => {
        checkForError(err);
        if (selected.amount < req.body.amount) return next(new Error('Requested amount is greater than what can be afforded'));
        res.from = selected;
        return next();
    })
}

db.run(`CREATE TABLE IF NOT EXISTS envelopes(
    id INTEGER PRIMARY KEY,
    category TEXT NOT NULL,
    amount INTEGER NOT NULL)`, (error) => console.error(error));

app.use(express.json());
app.listen(PORT, () => console.log(`Server started on port ${PORT}`));

app.param('id', (req, res, next, id) => {
    db.get(`SELECT * from envelopes WHERE envelopes.id = ${id}`, (err, row) => {
        if (err) {
            next(err);
        } else if (row) {
            res.envelope = row;
            next();
        } else {
            res.status(404).send("Could not retrieve envelope");
        }
    })
})

app.get('/', (req, res, next) => {
    db.all(`SELECT * FROM envelopes`, (err, rows) => {
        if (err) {
            next(err);
        } else if (rows) {
            res.send({ envelopes: rows });
        } else {
            res.status(404).send("Could not retrieve envelopes");
        }
    })
});

app.get('/:id', (req, res) => {
    res.status(200).send({envelope: res.envelope});
})

app.post('/', validatePost, (req, res) => {
    console.log(req.body);
    db.run(`INSERT INTO envelopes (category, amount) VALUES ("${req.body.category}", ${req.body.amount})`, function (err){
        checkForError(err);
        db.get(`SELECT * FROM envelopes WHERE envelopes.id = ${this.lastID}`, (err, row) => {
            checkForError(err)
            res.status(201).send({ envelope: row });
        })
    });
})

app.put('/:id', validatePost, (req, res) => {
    db.run(`UPDATE envelopes SET category = "${req.body.category}", amount = ${req.body.amount} WHERE envelopes.id = ${req.params.id}`, function (err){
        checkForError(err);
        db.get(`SELECT * FROM envelopes WHERE envelopes.id = ${req.params.id}`, (err, row) => {
            checkForError(err);
            res.status(202).send({envelope: row});
        })
    })
})

app.patch('/:id', (req, res) => {
    if (req.body.category !== undefined) res.envelope.category = req.body.category;
    if (req.body.amount !== undefined) res.envelope.amount -= req.body.amount;
    db.run(`UPDATE envelopes SET category = "${res.envelope.category}", amount = ${res.envelope.amount} WHERE envelopes.id = ${req.params.id}`, function(err){
        checkForError(err);
        db.get(`SELECT * FROM envelopes WHERE envelopes.id = ${req.params.id}`, (err, row) => {
            checkForError(err);
            res.status(202).send({envelope: row});
        });
    });
})

app.patch('/transfer/:from/:to', checkBalance, (req, res) => {
    db.serialize(() => {
        db.run(`UPDATE envelopes SET amount = ${res.from.amount - req.body.amount}`, (err) => checkForError(err));
        db.get(`SELECT amount FROM envelopes WHERE envelopes.id = ${req.params.to}`, (err, row) => {
            checkForError(err);
            db.run(`UPDATE envelopes SET amount = ${row.amount + req.body.amount}`, (err) => checkForError(err));
        })
        db.all("SELECT * FROM envelopes", (err, rows) => {
            checkForError(err);
            res.status(202).send({envelopes: rows});
        })
    })
})

app.delete('/:id', (req, res) => {
    db.run(`DELETE FROM envelopes WHERE envelopes.id = ${req.params.id}`, function(err){
        checkForError(err);
        db.run(`SELECT * FROM envelopes`, (err, rows) => {
            checkForError(err);
            res.status(204).send({envelopes: rows});
        });
    })
})