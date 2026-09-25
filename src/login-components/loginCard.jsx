import { useState, useEffect } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";

function LoginCard() {
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [failed, setFailed] = useState(false);
  const [serverError, setServerError] = useState("");
  const [loggingIn, setLoggingIn] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    async function checkLogIn() {
      try {
        const response = await fetch("http://localhost:3000/me", {
          method: "GET",
          credentials: "include",
        });

        if (response.status === 200) {
          navigate("/home", { replace: true });
        }
      } catch (error) {
        console.error("Session check failed:", error);
      }
    }

    checkLogIn();
  }, [navigate]);

  const handleLogin = async () => {
    setFailed(false);
    setServerError("");
    setLoggingIn(true);

    try {
      const response = await fetch("http://localhost:3000/login", {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ identifier, password }),
      });

      if (response.status === 401) {
        setFailed(true);
      } else if (response.ok) {
        navigate("/home", { replace: true });
      } else {
        setServerError("Something went wrong. Please try again.");
      }
    } catch (error) {
      console.error("Login error:", error);
      setServerError("Unable to connect to the server.");
    } finally {
      setLoggingIn(false);
    }
  };

  return (
    <div className="auth-page">
      <h1 className="greet">Welcome Back!</h1>

      {location.state?.success && (
        <p className="success-message">{location.state.success}</p>
      )}

      <input
        className={failed ? "input-error" : "identifier"}
        type="text"
        placeholder="Enter Your Username/Email"
        value={identifier}
        onChange={(e) => {
          setIdentifier(e.target.value);
          setFailed(false);
        }}
      />

      <input
        type="password"
        placeholder="Enter your password"
        className={failed ? "input-error" : "password"}
        value={password}
        onChange={(e) => {
          setPassword(e.target.value);
          setFailed(false);
        }}
      />

      {failed && <p className="error-message">Incorrect username or password</p>}
      {serverError && <p className="error-message">{serverError}</p>}

      <Link to="/forgotPasswordPage">Forgot Your Password?</Link>
      <Link to="/signUpPage">Don't have an account? Sign Up Now!</Link>
      <button className="sign-in-btn" onClick={handleLogin} disabled={loggingIn}>
        {loggingIn ? "Signing In…" : "Sign In"}
      </button>
    </div>
  );
}

export default LoginCard;
