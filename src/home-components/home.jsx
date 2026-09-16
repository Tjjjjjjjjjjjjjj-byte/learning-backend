import { Link } from "react-router-dom";
import { useNavigate } from "react-router-dom";
function HomeBtn() {
    const navigate = useNavigate();
    const navHome = () => {
        navigate("/home")
    }
    return (
        <button className="homeBtn" onClick={navHome}><span className="material-symbols-outlined">
home
</span></button>
    )
}
export default HomeBtn