import express from 'express';
import auth from "../../middleWare/authWare.js";
import {  getSpinStatus, playSpin } from '../spinner/spinController.js';

const router = express.Router();

// Spin & Win APIs
router.get("/status", auth, getSpinStatus);
router.post("/play", auth, playSpin);

export default router;
    
