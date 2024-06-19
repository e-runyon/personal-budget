const express = require('express');
const cors = require('cors');
const sqlite3 = require('sqlite3').verbose();
const PORT = process.env.PORT || 3000;

const app = express();
const db = new sqlite3.Database('./envelopes.sqlite', (error) => {
    if (error !== null) return console.error(error);
    console.log(`API started on port ${PORT}`);
});

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
        return res.status(400).send("Category and amount must be a string and number respectively");
    }
}

function checkEnvelope(id) {
    return new Promise((resolve, reject) => {
        db.get(`SELECT * FROM envelopes WHERE envelopes.id = ${id}`, (err, row) => {
            checkForError(err);
            if (row !== null) {
                resolve(row);
            } else {
                reject("Couldn't find envelope")
            }
        })
    })
}

function updateAmount(id, amount) {
    return new Promise((resolve, reject) => {
        db.run(`UPDATE envelopes SET amount = ${amount} WHERE envelopes.id = ${id}`, function (err) {
            if (err !== null) reject("Couldn't update envelopes");
            db.get(`SELECT * FROM envelopes WHERE envelopes.id = ${id}`, (err, row) => {
                if (err !== null) reject("Couldn't update envelopes");
                resolve(row);
            })
        })
    })
}

db.run(`CREATE TABLE IF NOT EXISTS envelopes(
    id INTEGER PRIMARY KEY,
    category TEXT NOT NULL,
    amount INTEGER NOT NULL)`);

app.use(express.json());
app.listen(PORT);

app.param('id', (req, res, next, id) => {
    db.get(`SELECT * from envelopes WHERE envelopes.id = ${id}`, (err, row) => {
        if (err) {
            next(err);
        } else if (row) {
            res.envelope = row;
            next();
        } else {
            return res.status(404).send("Could not retrieve envelope");
        }
    })
})

app.get('/', (req, res, next) => {
    db.all(`SELECT * FROM envelopes`, (err, rows) => {
        if (err) {
            next(err);
        } else if (rows) {
            return res.send({ envelopes: rows });
        } else {
            return res.status(404).send("Could not retrieve envelopes");
        }
    })
});

app.get('/:id', (req, res) => {
    return res.status(200).send({ envelope: res.envelope });
})

app.post('/', validatePost, (req, res) => {
    db.run(`INSERT INTO envelopes (category, amount) VALUES ("${req.body.category}", ${req.body.amount})`, function (err) {
        checkForError(err);
        db.get(`SELECT * FROM envelopes WHERE envelopes.id = ${this.lastID}`, (err, row) => {
            checkForError(err)
            return res.status(201).send({ envelope: row });
        })
    });
})

app.put('/:id', validatePost, (req, res) => {
    db.run(`UPDATE envelopes SET category = "${req.body.category}", amount = ${req.body.amount} WHERE envelopes.id = ${req.params.id}`, function (err) {
        checkForError(err);
        db.get(`SELECT * FROM envelopes WHERE envelopes.id = ${req.params.id}`, (err, row) => {
            checkForError(err);
            return res.status(202).send({ envelope: row });
        })
    })
})

app.patch('/:id', (req, res) => {
    if (req.body.category !== undefined) res.envelope.category = req.body.category;
    if (req.body.amount !== undefined) res.envelope.amount -= req.body.amount;
    db.run(`UPDATE envelopes SET category = "${res.envelope.category}", amount = ${res.envelope.amount} WHERE envelopes.id = ${req.params.id}`, function (err) {
        checkForError(err);
        db.get(`SELECT * FROM envelopes WHERE envelopes.id = ${req.params.id}`, (err, row) => {
            checkForError(err);
            return res.status(202).send({ envelope: row });
        });
    });
})

app.patch('/transfer/:from/:to', async (req, res, next) => {
    let envelopes = [];
    console.log("Initiating Transfer");
    try {
        if (typeof req.body.amount !== 'number' || req.body.amount <= 0) throw new Error("Invalid amount entered: must be a number greater than 0");
        const origin = await checkEnvelope(req.params.from);
        const destination = await checkEnvelope(req.params.to);
        if (origin.amount < req.body.amount || origin.amount <= 0) {
            return res.status(400).send("Insufficient funds");
        } else {
            envelopes = [
                {
                    id: origin.id,
                    category: origin.category,
                    amount: origin.amount - req.body.amount
                },
                {
                    id: destination.id,
                    category: destination.category,
                    amount: destination.amount + req.body.amount
                }
            ]
        };
        const originUpdateResult = await updateAmount(origin.id, envelopes[0].amount);
        const destinationUpdateResult = await updateAmount(destination.id, envelopes[1].amount);
        const response = JSON.stringify(envelopes);
        console.log("Transfer Completed")
        return res.status(200).send(response);
    } catch (error) {
        console.error(error);
        return res.status(400).send({ Error: error.message });
    }
})

app.delete('/:id', (req, res) => {
    db.run(`DELETE FROM envelopes WHERE envelopes.id = ${req.params.id}`, function (err) {
        checkForError(err);
        db.run(`SELECT * FROM envelopes`, (err, rows) => {
            checkForError(err);
            return res.status(204).send({ envelopes: rows });
        });
    })
})
