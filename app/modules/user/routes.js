import express from 'express';
// import auth from "../../middleWare/authWare.js";

import {
	guestLogin,
	sendRequest,
	acceptRequest,
	rejectRequest,
	getRequests,
	getFriends,
	getUserByPID,
} from './controller.js';

const router = express.Router();

router.post("/guest",guestLogin);
router.get("/user/:PID",getUserByPID); // Get user by PID
router.post("/sendRequest",sendRequest);
router.post("/acceptRequest",acceptRequest);
router.post("/rejectRequest",rejectRequest);
router.get("/requests",getRequests);
router.get("/friends",getFriends);

export default router;    
