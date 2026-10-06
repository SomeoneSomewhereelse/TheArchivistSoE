// Keeps a render-time throw in one tab's panel from blanking the whole page. The tab bar stays
// outside it, and `resetKey` (the current tab) clears the failure when the user moves on.
import React from "react";

export default class ErrorBoundary extends React.Component {
    state = {error: null, resetKey: this.props.resetKey};

    static getDerivedStateFromError(error) {
        return {error};
    }

    static getDerivedStateFromProps(props, state) {
        return props.resetKey === state.resetKey ? null : {error: null, resetKey: props.resetKey};
    }

    componentDidCatch(error, info) {
        console.error("A tab failed to render", error, info.componentStack);
    }

    render() {
        if (!this.state.error) return this.props.children;

        return (<div className="helpPanel errorPanel" role="alert">
            <div className="helpTitle">This tab failed to load</div>
            <div className="helpBody">
                Something went wrong while showing it. The other tabs should still work.
                <div className="errorDetail">{String(this.state.error?.message ?? this.state.error)}</div>
                <button type="button" className="btn" onClick={() => window.location.reload()}>
                    Reload the page
                </button>
            </div>
        </div>);
    }
}
