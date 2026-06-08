/**
 * main.js
 * Composition root. The single place where concrete dependencies are
 * resolved and wired together, then handed to the Game. Nothing else
 * imports the DOM directly.
 */
import { Game } from './core/Game.js';

const canvas = document.getElementById('game-canvas');
const stage = document.getElementById('game-stage');

const game = new Game(canvas, stage);
game.start();
