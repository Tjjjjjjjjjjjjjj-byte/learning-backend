import express from "express";
import fs from "fs";
import cors from "cors";
import validator from "validator"

const app = express();
const PORT = 3000;

app.use(express.json()); 
app.use(cors());

app.post("/login", (req, res) => {
  const { identifier, password } = req.body;

  const usersData = fs.readFileSync("./users.json", "utf-8");
  const users = JSON.parse(usersData);

  const foundUser = users.find((u) => u.identifier === identifier, u.email === identifier);

  if (!foundUser || foundUser.password !== password) {
    return res.status(401).json({ message: "Invalid credentials" }); 
  }

  return res.status(200).json({ message: "Login successful" });
});

app.post("/signUpPage", (req, res) => {
  const { username, email, password, confirmPassword } = req.body;

  const usersData = fs.readFileSync("./users.json", "utf-8");
  const users = JSON.parse(usersData);

  if (password !== confirmPassword) {
    return res.status(400).json({ message: "Passwords do not match" });
  }

  if (!validator.isEmail(email)) {
    return res.status(422).json({ message: "Must be a valid email" });
  }

  const userExists = users.some((u) => u.identifier === username || u.email === email);

  if (userExists) {
    return res.status(409).json({ message: "Username or Email already taken" });
  }

  const newUser = { identifier: username, email, password };
  users.push(newUser);

  fs.writeFileSync("./users.json", JSON.stringify(users, null, 2), "utf-8");

  return res.status(200).json({ message: "Registration successful" });
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
