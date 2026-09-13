import { useState } from "react";
import { Link } from "react-router-dom";

function LoginCard() {
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  

  const handleLogin = async () => {
    try {
      const response = await fetch("http://localhost:3000/", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ identifier, password }),
      });

      if (!response.ok) {
        throw new Error("error");
      } else {
        console.log("loffed in");
      }
    } catch (error) {}
  };

  return (
    <div className="auth-page">
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
      <Link to="/forgotPasswordPage">Forgot Your Password?</Link>
      <Link to="/signUpPage">Don't have an account? Sign Up Now!</Link>
      <button className="sign-in-btn" onClick={handleLogin}>
        Sign In
      </button>
    </div>
  );
}
export default LoginCard;
