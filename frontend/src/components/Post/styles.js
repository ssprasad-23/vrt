import { Dimensions, StyleSheet } from "react-native";

const styles = StyleSheet.create({
    container: {
        width: "100%",
        height: Dimensions.get("window").height,
        backgroundColor: "#000",
    },
    video: {
        position: "absolute",
        top: 0,
        left: 0,
        bottom: 0,
        right: 0,
    },
    uiContainer: {
        height: "100%",
        justifyContent: "flex-end",
    },
    bottomContainer: {
        padding: 16,
        paddingRight: 72,
        justifyContent: "flex-end",
        alignItems: "flex-start",
    },
    handle: {
        color: "#fff",
        fontSize: 16,
        fontWeight: "600",
        marginBottom: 4,
        textShadowColor: "rgba(0,0,0,0.65)",
        textShadowOffset: {width: 0, height: 1},
        textShadowRadius: 4,
    },
    description: {
        color: "#fff",
        fontSize: 14,
        fontWeight: "400",
        marginBottom: 6,
        opacity: 0.9,
        textShadowColor: "rgba(0,0,0,0.65)",
        textShadowOffset: {width: 0, height: 1},
        textShadowRadius: 4,
    },
    rightContainer: {
        alignSelf: "flex-end",
        position: "absolute",
        justifyContent: "center",
        alignItems: "center",
        gap: 15,
        padding: 15,
        bottom: 10,
    },
    actionButton: {
        alignItems: "center",
    },
    actionLabel: {
        color: "#fff",
        fontSize: 12,
        fontWeight: "500",
        marginTop: 4,
        textShadowColor: "rgba(0,0,0,0.65)",
        textShadowOffset: {width: 0, height: 1},
        textShadowRadius: 4,
    },
    heart: {
        textAlign: "center",
    },
    profilePic: {
        position: "absolute",
        left: 16,
        width: 36,
        height: 36,
        borderRadius: 18,
        borderWidth: 0.5,
        borderColor: "rgba(255,255,255,0.3)",
    },

});

export default styles;
