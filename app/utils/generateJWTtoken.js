import jwt from "jsonwebtoken";

export function jwtTokenGenerator(userId) {
    const payload = { user: { id: userId } };
    const token = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: "365d" });
    return token;
}