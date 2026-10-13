import { render } from 'preact';
import { keepFeedsFresh } from './state/feeds';
import { start } from './state/store';
import { App } from './ui/App';
import './styles/app.css';

void start().then(keepFeedsFresh);
render(<App />, document.getElementById('app')!);
