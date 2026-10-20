import express from "express"
import {
    createUser,
    loginUser,
    refreshTokenController,
    logoutController,
    forgotPassword,
    verifyResetCode,
    resetPassword
} from "../controller/authController.js"

const router = express.Router()

router.post("/userSignUp", createUser)
router.post("/userLogin", loginUser)
router.post('/refreshToken', refreshTokenController);
router.post('/logout', logoutController);
router.post('/forgotPassword', forgotPassword);
router.post('/verifyResetCode', verifyResetCode);
router.post('/resetPassword', resetPassword);


export default router