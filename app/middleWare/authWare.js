import jwt from "jsonwebtoken";
import User from "../modules/user/model.js";
export default async function auth(req, res, next) {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({
        success: false,
        message: "Please authenticate",
      });
    }

    const token = authHeader.split(" ")[1];

    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    const user = decoded.user || decoded;

    // Check user exists in database
    const dbUser = await User.findById(user.id || user._id);

    if (!dbUser) {
      return res.status(401).json({
        success: false,
        message: "Please authenticate",
        userNotFound: true,
      });
    }

    req.user = dbUser;

    next();
  } catch (err) {
    if (err.name === "TokenExpiredError") {
      return res.status(401).json({
        success: false,
        message: "Please authenticate",
        tokenExpired: true,
      });
    }

    return res.status(401).json({
      success: false,
      message: "Please authenticate",
    });
  }
}