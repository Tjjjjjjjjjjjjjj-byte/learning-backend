import express from "express";
import fs from "fs";
import cors from "cors";

const app = express();
const PORT = 3000;

app.use(express.json()); // lets req.body parse incoming JSON
app.use(cors());

app.post("/login", (req, res) => {
  const { identifier, password } = req.body;

  const usersData = fs.readFileSync("./users.json", "utf-8");
  const users = JSON.parse(usersData);

  const foundUser = users.find((u) => u.identifier === identifier);

  if (!foundUser) {
    return res.status(401);
  }

  if (foundUser.password !== password) {
    return res.status(401);
  }

  res.status(200);
});

app.post("/signUpPage", (req, res) => {
  const { username, email, password, confirmPassword } = req.body;

  const usersData = fs.readFileSync("./users.json", "utf-8");
  const users = JSON.parse(usersData);

  const foundUser = users.find((u) => u.identifier === identifier);

  if (foundUser) {
    return res.status(409);
  } else if (foundUser.email) {
    return res.status(409);
  } else {
    const newUser = { username, email, password };

    if (password !== confirmPassword) {
      res.status(400);
    } else {
      users.push(newUser);
      fs.writeFileSync(
        "./users.json",
        JSON.stringify(users, null, 2), // 2nd: Convert array to indented JSON text
        "utf-8",
      );
      res.status(200);
    }
  }
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
