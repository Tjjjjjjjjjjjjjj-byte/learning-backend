import { useState } from "react";
import { Link } from "react-router-dom";

function SignUpCard() {
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordFailed, setPasswordFailed] = useState(false);
  const [failed, setFailed] = useState(false);
  const [emailFailed, setEmailFailed] = useState(false);

  const handleSignUp = async () => {
    setFailed(false);
    setPasswordFailed(false);
    setEmailFailed(false);
    try {
      const response = await fetch("http://localhost:3000/signUpPage", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ username, email, password, confirmPassword }), // Pass input state data
      });

      if (response.status === 409) {
        setFailed(true);
      } else if (response.status === 400) {
        setPasswordFailed(true);
      } else if (response.status === 422) {
        setEmailFailed(true);
      } else {
        setFailed(false);
      }
    } catch (error) {
      console.error("Network error:", error);
    }
  };

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
      {failed && <p className="error-message">UserName is already taken.</p>}
      <input
        className="identifier"
        type="email"
        placeholder="Enter Your Email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
      />
      {emailFailed && (
        <p className="error-message">please enter a valid email.</p>
      )}
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
      {passwordFailed && (
        <p className="error-message">Make sure That your passwords matches</p>
      )}
      <button className="submit-btn" onClick={handleSignUp}>
        Sign Up
      </button>
      <Link to="/login">Already have an account? Log In</Link>
    </div>
  );
}

export default SignUpCard;
