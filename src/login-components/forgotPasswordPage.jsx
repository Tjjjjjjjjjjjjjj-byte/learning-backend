import { useState } from "react";
import { Link } from "react-router-dom";

function ForgotPasswordPage() {
    const [email, setEmail] = useState('')

  return (
    <div>
      <h1 className="greet">Forgot Your Password?</h1>
      <input
        className="identifier"
        type="text"
        placeholder="Enter Your Email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
      />
      <button className="submit-btn">Send Reset Link</button>
      <Link to="/loginPage">Back to Login</Link>
    </div>
  );
}

export default ForgotPasswordPage;