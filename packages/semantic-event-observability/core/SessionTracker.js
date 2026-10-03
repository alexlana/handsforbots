/**
 * Count turn outcomes within the current session for rollup metrics.
 */
export function createSessionTracker() {
	let completed = 0
	let abandoned = 0

	return {
		recordTurn(status) {
			if (status === 'completed') completed += 1
			else if (status === 'abandoned') abandoned += 1
		},

		getCounts() {
			return { completed, abandoned }
		},

		reset() {
			completed = 0
			abandoned = 0
		},
	}
}
