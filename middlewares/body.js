const express = require('express');

// Encapsulate body parser as middleware factory
function bodyMiddleware() {
    // Extended true because it allows parsing nested objects,
    //  which is more flexible for future needs
	return express.urlencoded({ extended: true });
}

module.exports = bodyMiddleware;
