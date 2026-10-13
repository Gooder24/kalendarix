import { render } from 'preact';
import { start } from './state/store';
import { Popup } from './ui/popup/Popup';
import './styles/app.css';

void start();
render(<Popup />, document.getElementById('app')!);
