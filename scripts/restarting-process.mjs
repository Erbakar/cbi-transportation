// Keep launchd's parent alive through temporary network/child failures.
export function restartingProcess(start, {schedule = setTimeout, cancel = clearTimeout, now = Date.now, onRetry = () => {}} = {}) {
    let child, timer, stopped = false, failures = 0;
    function launch() {
        if (stopped) return;
        const started = now();
        let finished = false;
        function retry() {
            if (finished || stopped) return;
            finished = true;
            child = undefined;
            if (now() - started >= 300000) failures = 0;
            const delay = Math.min(300000, 15000 * 2 ** Math.min(failures++, 5));
            onRetry(delay);
            timer = schedule(launch, delay);
        }
        try {
            child = start();
            child.once('error', retry);
            child.once('close', retry);
        } catch {retry();}
    }
    launch();
    return {stop() {stopped = true; cancel(timer); child?.kill('SIGTERM');}};
}
