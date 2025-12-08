const jwt = require('jsonwebtoken');


const verifyToken = (req, res, next) => {
    const authHeader = req.headers.token || req.headers.authorization;

    if (authHeader) {
       
        const token = authHeader.split(" ")[1]; 

        jwt.verify(token, process.env.JWT_SECRET || "mySuperSecretKey123", (err, user) => {
            if (err) {
                return res.status(403).json("Token is not valid!");
            }
           
            req.user = user;
            next();
        });
    } else {
        return res.status(401).json("You are not authenticated! No token found.");
    }
};

module.exports = { verifyToken };