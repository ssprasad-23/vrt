import { StyleSheet } from "react-native";

const styles = StyleSheet.create({
    container: {
        width: "100%",
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
    profilePic: {
        position: "absolute",
        left: 16,
        width: 36,
        height: 36,
        borderRadius: 18,
        borderWidth: 0.5,
        borderColor: "rgba(255,255,255,0.3)",
    },
    // centred spinner while the playing video waits for data
    bufferingOverlay: {
        ...StyleSheet.absoluteFillObject,
        justifyContent: "center",
        alignItems: "center",
    },
    // 80% down the screen, above the handle/description; marginTop centres the track on that line
    progressContainer: {
        position: "absolute",
        // inset from the screen edges
        left: 30,
        right: 30,
        top: "80%",
        marginTop: -12,
        zIndex: 1,
    },
    // times sit just above the bar without moving it off the 80% line
    progressTimes: {
        position: "absolute",
        left: 0,
        right: 0,
        bottom: "100%",
        flexDirection: "row",
        justifyContent: "space-between",
    },
    progressTime: {
        color: "#fff",
        fontSize: 12,
        fontWeight: "500",
        fontVariant: ["tabular-nums"],
        textShadowColor: "rgba(0,0,0,0.65)",
        textShadowOffset: {width: 0, height: 1},
        textShadowRadius: 4,
    },
    // taller than the track so it's easy to hit; the track sits in its middle
    progressTouchArea: {
        height: 24,
        justifyContent: "center",
    },
    // no background of its own: the unloaded part is empty, so only the loaded and played layers show
    progressTrack: {
        height: 2,
        borderRadius: 2,
        overflow: "hidden",
    },
    progressTrackActive: {
        height: 4,
    },
    // loaded so far; sits under the played fill
    progressBuffered: {
        position: "absolute",
        left: 0,
        top: 0,
        bottom: 0,
        backgroundColor: "rgba(255,255,255,0.5)",
    },
    progressFill: {
        position: "absolute",
        left: 0,
        top: 0,
        bottom: 0,
        backgroundColor: "#fff",
    },
    progressThumb: {
        position: "absolute",
        top: 7,
        width: 10,
        height: 10,
        marginLeft: -5,
        borderRadius: 5,
        backgroundColor: "#fff",
    },
});

export default styles;
