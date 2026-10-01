// API routes for this feature area.
export function registerRoutes(app, context) {
  const {
    validator,
    crypto,
    readPasswordResets,
    savePasswordResets,
    findUserByIdentifierOrEmail,
    findUserByIdentifier,
    findUserByEmail,
    createUser,
    updateUserPassword,
  } = context;

app.get("/me", (req, res) => {
  if (req.session.user) {
    res.status(200).json({
      loggedIn: true,
      user: req.session.user,
    });
  } else {
    res.status(401).json({
      loggedIn: false,
    });
  }
});

app.post("/login", (req, res) => {
  const { identifier, password } = req.body ?? {};

  if (
    typeof identifier !== "string" ||
    typeof password !== "string" ||
    !identifier.trim() ||
    !password
  ) {
    return res.status(400).json({
      message: "Username/email and password are required",
    });
  }

  const foundUser = findUserByIdentifierOrEmail(identifier.trim());

  if (!foundUser || foundUser.password !== password) {
    return res.status(401).json({
      message: "Invalid credentials",
    });
  }

  req.session.user = {
    username: foundUser.identifier,
  };

  return res.status(200).json({
    message: "Login successful",
  });
});

app.post("/signUpPage", (req, res) => {
  const { username: rawUsername, email, password, confirmPassword } = req.body ?? {};

  const username = typeof rawUsername === "string" ? rawUsername.trim() : "";

  if (!username) {
    return res.status(400).json({
      message: "Username is required",
      field: "username",
    });
  }

  if (typeof password !== "string" || password.length < 6) {
    return res.status(400).json({
      message: "Password must be at least 6 characters",
      field: "password",
    });
  }

  if (password !== confirmPassword) {
    return res.status(400).json({
      message: "Passwords do not match",
      field: "confirmPassword",
    });
  }

  if (typeof email !== "string" || !validator.isEmail(email)) {
    return res.status(422).json({
      message: "Must be a valid email",
    });
  }

  const userExists = findUserByIdentifier(username) || findUserByEmail(email);

  if (userExists) {
    return res.status(409).json({
      message: "Username or Email already taken",
    });
  }

  const newUser = {
    identifier: username,
    email,
    password,
  };

  try {
    createUser(newUser);
  } catch (error) {
    // UNIQUE constraint: someone registered the same name/email between the check and the insert.
    if (String(error?.message).includes("UNIQUE")) {
      return res.status(409).json({
        message: "Username or Email already taken",
      });
    }
    throw error;
  }

  return res.status(200).json({
    message: "Registration successful",
  });
});

app.post("/forgotPassword", (req, res) => {
  const { email } = req.body;

  if (!email || !validator.isEmail(email)) {
    return res.status(422).json({
      message: "Must be a valid email",
    });
  }

  const user = findUserByEmail(email);

  if (!user) {
    return res.status(200).json({
      message: "If that email exists, a reset link has been generated.",
    });
  }

  const token = crypto.randomBytes(24).toString("hex");

  const resets = readPasswordResets();

  resets[token] = {
    username: user.identifier,
    expiresAt: Date.now() + 15 * 60 * 1000,
  };

  savePasswordResets(resets);

  return res.status(200).json({
    message:
      "Reset link generated. This local development build does not send email.",
    resetUrl: `http://localhost:5173/resetPasswordPage?token=${token}`,
  });
});

app.post("/resetPassword", (req, res) => {
  const { token, password } = req.body;

  if (!token || !password || password.length < 6) {
    return res.status(400).json({
      message:
        "A valid token and a password of at least 6 characters are required",
    });
  }

  const resets = readPasswordResets();

  const reset = resets[token];

  if (!reset || reset.expiresAt < Date.now()) {
    if (reset) {
      delete resets[token];
      savePasswordResets(resets);
    }

    return res.status(400).json({
      message: "Reset link is invalid or expired",
    });
  }

  const user = findUserByIdentifier(reset.username);

  if (!user) {
    delete resets[token];

    savePasswordResets(resets);

    return res.status(404).json({
      message: "User not found",
    });
  }

  updateUserPassword(user.identifier, password);

  delete resets[token];

  savePasswordResets(resets);

  return res.status(200).json({
    message: "Password reset successful",
  });
});

app.post("/logout", (req, res) => {
  req.session.destroy((error) => {
    if (error) {
      return res.status(500).json({
        message: "Logout failed",
      });
    }

    res.clearCookie("connect.sid");

    return res.status(200).json({
      message: "Logout successful",
    });
  });
});

}
