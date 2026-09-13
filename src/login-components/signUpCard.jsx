import { useState } from "react";
import { Link } from "react-router-dom";

function SignUpCard() {
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  return (
    <div className="auth-page">
      <h1 className="greet">Create Your Account</h1>
      <input
        className="identifier"
        type="text"
        placeholder="Choose a Username"
        value={username}
        onChange={(e) => setUsername(e.target.value)}
      />
      <input
        className="identifier"
        type="email"
        placeholder="Enter Your Email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
      />
      <input
        type="password"
        placeholder="Create a Password"
        className="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
      />
      <input
        type="password"
        placeholder="Confirm Password"
        className="password"
        value={confirmPassword}
        onChange={(e) => setConfirmPassword(e.target.value)}
      />
      <button className="submit-btn">Sign Up</button>
      <Link to="/">Already have an account? Log In</Link>
    </div>
  );
}

export default SignUpCard;