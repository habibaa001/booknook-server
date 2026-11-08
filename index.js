const express = require("express");
const cors = require("cors");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const jwt = require("jsonwebtoken");
const cookieParser = require("cookie-parser");
require("dotenv").config();

const app = express();
const port = process.env.PORT || 5000;

app.use(
  cors({
    origin: [process.env.CLIENT_URL, "http://localhost:3000", "http://localhost:3001"],
    credentials: true,
  })
);
app.use(express.json());
app.use(cookieParser());

const uri = process.env.MONGODB_URI;
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

// JWT Middleware
const verifyToken = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).send({ message: "Unauthorized access" });
  }
  const token = authHeader.split(" ")[1];
  jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
    if (err) {
      return res.status(403).send({ message: "Forbidden access" });
    }
    req.user = decoded;
    next();
  });
};

async function run() {
  try {
    await client.connect();
    const db = client.db("booknook");
    const booksCollection = db.collection("books");
    const borrowsCollection = db.collection("borrows");

    // 1. Issue JWT Token
    app.post("/jwt", async (req, res) => {
      const user = req.body;
      const token = jwt.sign(user, process.env.JWT_SECRET, { expiresIn: "7d" });
      res.send({ token });
    });

    // 2. GET /books - All books or New Arrivals
    app.get("/books", async (req, res) => {
      const { limit, sort } = req.query;
      let query = booksCollection.find();
      if (sort === "desc") {
        query = query.sort({ createdAt: -1 });
      }
      if (limit) {
        query = query.limit(parseInt(limit));
      }
      const result = await query.toArray();
      res.send(result);
    });

    // 3. GET /books/:id - Single book
    app.get("/books/:id", async (req, res) => {
      const id = req.params.id;
      const result = await booksCollection.findOne({ _id: new ObjectId(id) });
      if (!result) return res.status(404).send({ message: "Book not found" });
      res.send(result);
    });

    // 4. POST /books - Add new book (Protected)
    app.post("/books", verifyToken, async (req, res) => {
      const bookData = {
        ...req.body,
        totalCopies: parseInt(req.body.totalCopies) || 1,
        availableCopies: parseInt(req.body.totalCopies) || 1,
        createdAt: new Date(),
      };
      const result = await booksCollection.insertOne(bookData);
      res.send(result);
    });

    // 5. PATCH /books/:id - Update book (Protected)
    app.patch("/books/:id", verifyToken, async (req, res) => {
      const id = req.params.id;
      const filter = { _id: new ObjectId(id) };
      const updatedDoc = {
        $set: {
          title: req.body.title,
          author: req.body.author,
          category: req.body.category,
          image: req.body.image,
          description: req.body.description,
          totalCopies: parseInt(req.body.totalCopies),
        },
      };
      const result = await booksCollection.updateOne(filter, updatedDoc);
      res.send(result);
    });

    // 6. DELETE /books/:id - Delete book (Protected)
    app.delete("/books/:id", verifyToken, async (req, res) => {
      const id = req.params.id;
      const result = await booksCollection.deleteOne({ _id: new ObjectId(id) });
      res.send(result);
    });

    // 7. POST /borrows - Borrow book (Protected)
    app.post("/borrows", verifyToken, async (req, res) => {
      const { bookId, bookTitle, bookImage, userEmail, userName, returnDate } = req.body;

      const existingBorrow = await borrowsCollection.findOne({
        bookId,
        userEmail,
      });
      if (existingBorrow) {
        return res
          .status(400)
          .send({ message: "You have already borrowed this book!" });
      }

      const book = await booksCollection.findOne({ _id: new ObjectId(bookId) });
      if (!book || book.availableCopies <= 0) {
        return res.status(400).send({ message: "Book is not available!" });
      }

      await booksCollection.updateOne(
        { _id: new ObjectId(bookId) },
        { $inc: { availableCopies: -1 } }
      );

      const borrowDoc = {
        bookId,
        bookTitle,
        bookImage,
        userName,
        userEmail,
        borrowDate: new Date().toISOString().split("T")[0],
        returnDate:
          returnDate ||
          new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
            .toISOString()
            .split("T")[0],
      };
      const result = await borrowsCollection.insertOnes
      const insertResult = await borrowsCollection.insertOne(borrowDoc);
      res.send(insertResult);
    });

    // 8. GET /borrows - Logged in user borrows (Protected)
    app.get("/borrows", verifyToken, async (req, res) => {
      const email = req.query.email;
      if (req.user.email !== email) {
        return res.status(403).send({ message: "Forbidden access" });
      }
      const result = await borrowsCollection
        .find({ userEmail: email })
        .toArray();
      res.send(result);
    });

    // 9. DELETE /borrows/:id - Return book (Protected)
    app.delete("/borrows/:id", verifyToken, async (req, res) => {
      const id = req.params.id;
      const borrowRecord = await borrowsCollection.findOne({
        _id: new ObjectId(id),
      });
      if (!borrowRecord) {
        return res.status(404).send({ message: "Borrow record not found" });
      }

      await booksCollection.updateOne(
        { _id: new ObjectId(borrowRecord.bookId) },
        { $inc: { availableCopies: 1 } }
      );

      const result = await borrowsCollection.deleteOne({
        _id: new ObjectId(id),
      });
      res.send(result);
    });

    // 10. Seed Books Endpoint
    app.get("/seed-books-force", async (req, res) => {
      try {
        await booksCollection.deleteMany({});
        const initialBooks = [
          {
            title: "The Hobbit",
            author: "J.R.R. Tolkien",
            category: "Fiction",
            totalCopies: 5,
            availableCopies: 4,
            image: "https://images.unsplash.com/photo-1621351183012-e2f9972dd9bf?w=500",
            description: "Bilbo Baggins leaves his quiet hole for a quest with thirteen dwarves.",
            userEmail: "admin@booknook.app",
            userName: "Admin",
            createdAt: new Date("2026-03-01"),
          },
          {
            title: "Pride and Prejudice",
            author: "Jane Austen",
            category: "Fiction",
            totalCopies: 3,
            availableCopies: 3,
            image: "https://images.unsplash.com/photo-1544716278-ca5c3f4abd8c?w=500",
            description: "Romantic novel following Elizabeth Bennet as she deals with manners and marriage.",
            userEmail: "admin@booknook.app",
            userName: "Admin",
            createdAt: new Date("2026-03-02"),
          },
          {
            title: "Nineteen Eighty-Four",
            author: "George Orwell",
            category: "Fiction",
            totalCopies: 4,
            availableCopies: 2,
            image: "https://images.unsplash.com/photo-1543002588-bfa74002ed7c?w=500",
            description: "Dystopian social science fiction novel and cautionary tale.",
            userEmail: "admin@booknook.app",
            userName: "Admin",
            createdAt: new Date("2026-03-03"),
          },
          {
            title: "To Kill a Mockingbird",
            author: "Harper Lee",
            category: "Fiction",
            totalCopies: 2,
            availableCopies: 1,
            image: "https://images.unsplash.com/photo-1512820798803-83ca734da794?w=500",
            description: "A gripping portrayal of racial injustice in the American South.",
            userEmail: "admin@booknook.app",
            userName: "Admin",
            createdAt: new Date("2026-03-04"),
          },
          {
            title: "The Great Gatsby",
            author: "F. Scott Fitzgerald",
            category: "Fiction",
            totalCopies: 4,
            availableCopies: 4,
            image: "https://images.unsplash.com/photo-1495640388908-05fa85288c61?w=500",
            description: "A portrait of the Jazz Age and the tragedy of the American dream.",
            userEmail: "admin@booknook.app",
            userName: "Admin",
            createdAt: new Date("2026-03-05"),
          },
          {
            title: "Dune",
            author: "Frank Herbert",
            category: "Science",
            totalCopies: 3,
            availableCopies: 3,
            image: "https://images.unsplash.com/photo-1532012164546-f432f2e3777a?w=500",
            description: "Set on the desert planet Arrakis, Dune is the story of Paul Atreides.",
            userEmail: "admin@booknook.app",
            userName: "Admin",
            createdAt: new Date("2026-03-06"),
          },
          {
            title: "Project Hail Mary",
            author: "Andy Weir",
            category: "Science",
            totalCopies: 5,
            availableCopies: 5,
            image: "https://images.unsplash.com/photo-1506880018603-83d5b814b5a6?w=500",
            description: "A lone astronaut must save the earth from disaster.",
            userEmail: "admin@booknook.app",
            userName: "Admin",
            createdAt: new Date("2026-03-07"),
          },
          {
            title: "The Martian",
            author: "Andy Weir",
            category: "Science",
            totalCopies: 4,
            availableCopies: 2,
            image: "https://images.unsplash.com/photo-1457369880461-52c61a468c7d?w=500",
            description: "An astronaut becomes stranded on Mars after a fierce storm.",
            userEmail: "admin@booknook.app",
            userName: "Admin",
            createdAt: new Date("2026-03-08"),
          },
          {
            title: "The Hitchhiker's Guide",
            author: "Douglas Adams",
            category: "Science",
            totalCopies: 3,
            availableCopies: 3,
            image: "https://images.unsplash.com/photo-1476275466078-4007374efbbe?w=500",
            description: "A comedic interstellar journey through time and space.",
            userEmail: "admin@booknook.app",
            userName: "Admin",
            createdAt: new Date("2026-03-09"),
          },
          {
            title: "The Name of the Wind",
            author: "Patrick Rothfuss",
            category: "Fiction",
            totalCopies: 3,
            availableCopies: 1,
            image: "https://images.unsplash.com/photo-1516979187457-637abb4f9353?w=500",
            description: "The tale of Kvothe from his childhood into legendary renown.",
            userEmail: "admin@booknook.app",
            userName: "Admin",
            createdAt: new Date("2026-03-10"),
          },
          {
            title: "A Brief History of Time",
            author: "Stephen Hawking",
            category: "Science",
            totalCopies: 6,
            availableCopies: 6,
            image: "https://images.unsplash.com/photo-1509228468518-188dd4864904?w=500",
            description: "Explores the profound questions about our universe.",
            userEmail: "admin@booknook.app",
            userName: "Admin",
            createdAt: new Date("2026-03-11"),
          },
          {
            title: "Sapiens: A Brief History",
            author: "Yuval Noah Harari",
            category: "History",
            totalCopies: 4,
            availableCopies: 3,
            image: "https://images.unsplash.com/photo-1497633762265-9d179a998aa6?w=500",
            description: "Surveys the history of humankind from the Stone Age up to modern days.",
            userEmail: "admin@booknook.app",
            userName: "Admin",
            createdAt: new Date("2026-03-12"),
          },
        ];

        const result = await booksCollection.insertMany(initialBooks);
        res.send({
          success: true,
          message: `Inserted ${result.insertedCount} books successfully!`,
        });
      } catch (error) {
        res.status(500).send({ error: error.message });
      }
    });

    console.log("MongoDB connected successfully");
  } finally {
    // Keep connection alive
  }
}

run().catch(console.dir);

app.get("/", (req, res) => {
  res.send("BookNook server is running");
});

app.listen(port, () => {
  console.log(`Server listening on port ${port}`);
});