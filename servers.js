const users = require("./users.json");
import e from "express";

const handleLogin = async () => {
  try {
    const response = await fetch("http://localhost:3000/login", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ identifier, password }),
    });

    if(!response.ok) {
        throw new Error('error')
    } else {
        console.log("loffed in")
    }

  } catch (error) {

  }
};
