import express from 'express';
import auth from "../../middleWare/authWare.js";

import {
	guestLogin,
	sendRequest,
	acceptRequest,
	rejectRequest,
	getUserByPID,
	getConnections,
	removeFriend
} from './controller.js';

import {
	getSpinStatus,
	playSpin
} from './spinController.js';

const router = express.Router();

router.post("/guest", guestLogin);
router.get("/user/:PID", auth, getUserByPID); // Get user by PID on Search
router.post("/sendRequest", auth, sendRequest);
router.post("/acceptRequest", auth, acceptRequest);
router.post("/rejectRequest", auth, rejectRequest);
router.get("/connections", auth, getConnections);
router.delete("/removeFriend/:userId", auth, removeFriend);

// Spin & Win APIs
router.get("/spin/status", auth, getSpinStatus);
router.post("/spin/play", auth, playSpin);

export default router;
    
