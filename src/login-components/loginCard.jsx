import { useState } from "react";
import { Link } from "react-router-dom";

function loginCard() {
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  return (
    <div>
      <h1 className="greet">Welcome Back!</h1>
      <input
        className="identifier"
        type="text"
        placeholder="Enter Your Username/Email"
        value={identifier}
        onChange={(e) => setIdentifier(e.target.value)}
      />
      <input
        type="text"
        placeholder="Enter your password"
        className="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
      />
      <Link to="/forgotPasswordPage">ForgotYourPassword?</Link>
      <Link to="/signUpPage">Don't have an account? Sign Up Now!</Link>
      <button className="sign-in-btn">Sign In</button>
    </div>
  );
}
export default loginCard;
