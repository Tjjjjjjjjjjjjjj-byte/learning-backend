import { useState } from "react";
import { Link } from "react-router-dom";
import { useNavigate } from "react-router-dom";

function LoginCard() {
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [failed, setFailed] = useState(false);
  const navigate = useNavigate();

  const handleLogin = async () => {
    try {
      const response = await fetch("http://localhost:3000/signUpPage", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ identifier, password }),
      });

      if (response.status === 401) {
        setFailed(true);
      } else {
        setFailed(false);
        navigate("/home")
      }
    } catch (error) {}
  };

  return (
    <div className="auth-page">
      <h1 className="greet">Welcome Back!</h1>
      <input
        className={failed ? "input-error" : "identifier"}
        type="text"
        placeholder="Enter Your Username/Email"
        value={identifier}
        onChange={(e) => setIdentifier(e.target.value)}
      />
      {failed && <p className="error-message">Incorrect username or password</p>}

      <input
        type="text"
        placeholder="Enter your password"
        className={failed ? "input-error" : "password"}
        value={password}
        onChange={(e) => setPassword(e.target.value)}
      />
      {failed && <p className="error-message">Incorrect username or password</p>}

      <Link to="/forgotPasswordPage">Forgot Your Password?</Link>
      <Link to="/signUpPage">Don't have an account? Sign Up Now!</Link>
      <button className="sign-in-btn" onClick={handleLogin}>
        Sign In
      </button>
    </div>
  );
}
export default LoginCard;
