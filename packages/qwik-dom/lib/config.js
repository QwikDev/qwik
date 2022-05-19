/*
 * This file defines Domino behaviour that can be externally configured.
 * To change these settings, set the relevant global property *before*
 * you call `require("domino")`.
 */

exports.isApiWritable = !global.__domino_frozen__;
