// Keeps a render-time throw in one panel from blanking the whole page. The tab bar stays outside it, and
// `resetKey` (the current tab, or the Item Builder's build query) clears the failure when it changes.
// `fallback`, when given, replaces the tab-wide failure panel (the item tooltip shows a one-line message).
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
        console.error("A panel failed to render", error, info.componentStack);
    }

    render() {
        if (!this.state.error) return this.props.children;
        if (this.props.fallback !== undefined) return this.props.fallback;

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
