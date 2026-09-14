import { useState } from "react";
import { Link } from "react-router-dom";


function ForgotPasswordCard() {
  const [email, setEmail] = useState('')

  return (
    <div className="auth-page">
      <h1 className="greet">Forgot Your Password?</h1>
      <input
        className="identifier"
        type="text"
        placeholder="Enter Your Email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
      />
      <button className="submit-btn">Send Reset Link</button>
      <Link to="/login">Back to Login</Link>
    </div>
  );
}

export default ForgotPasswordCard;