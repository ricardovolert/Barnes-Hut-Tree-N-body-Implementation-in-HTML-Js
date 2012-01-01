////////////
var MINMASS = 1e2;
var MAXMASS = 1e4;
var G = 1; // Gravitational Constant
var ETA = 10; // Softening constant
var GFACTOR = 1.3; // Higher means distance has more effect (3 is reality)
var dt; // Global DT set by html
var MAXDEPTH = 10; // BN tree max depth ( one less than actual, example with maxdepth = 2, the levels are [0 1 2] )
var BN_THETA = 1;
var INTERACTION_METHOD = "BN"; // BN or BRUTE, type of tree search to use


// Bodies struct containing all bodies
bods = {pos:{x:new Array(),y:new Array()},
		vel:{x:new Array(),y:new Array()},
		acc:{x:new Array(),y:new Array()},
		mass:new Array(),
		N:0};

// Canvas Context
var c;

// Called by HTML with canvasId passed in
function initBN(canvasId) {
	canvasElement = document.getElementById(canvasId);
	c = canvasElement.getContext("2d");
	if (DEBUG) {
		console.log('Initialize BN complete.');
	}
}

function addNrandomBodies(n){
	for (var i=0;i<n;i++) {
		addRandomBody();
	}
}

function addRandomBody() {
	addBody(
		Math.random()*canvasElement.width,
		Math.random()*canvasElement.height,
		Math.random()*10-5,
		Math.random()*10-5,
		Math.random()*(MAXMASS-MINMASS)+MINMASS
	);
}

function addBody(x,y,vx,vy,m) {
	bods.pos.x [bods.N] = x;
	bods.pos.y [bods.N] = y;
	bods.vel.x [bods.N] = vx;
	bods.vel.y [bods.N] = vy;
	bods.acc.x [bods.N] = 0;
	bods.acc.y [bods.N] = 0;
	bods.mass [bods.N] = m;
	bods.N = bods.N + 1;

	if (DEBUG) {
	    console.log("ADD BODY M: ",m," P:",x,",",y," V:",vx,",",vy);
	}
	if (bods.N >= 100 && DEBUG > 0) {
		setDEBUG(0); // temp check to keep debug off when too many bodies
	}
}
// BN Tree code ------
var bnDepth=0, bnNumNodes=0, bnNumLeafs=0;
function bnSetTreeStats() {
	bnDepth=0, bnNumNodes=0, bnNumLeafs=0;
	bnSetTreeStatsRecurse(bnRoot,0);
}
function bnSetTreeStatsRecurse(node,depth) {
	// If body in node
	bnNumNodes += 1;
	bnDepth = Math.max(depth,bnDepth);

	if ( node.b.length > 0 ) {
		if (node.b != "PARENT") {
			bnNumLeafs += 1;
		}
		// Draw Children
		for (var i=0;i<4;i++){
			var child = node.nodes[i];
			if (child) { bnSetTreeStatsRecurse(child,depth+1) }
		}
	}
}

function bnDeleteTree() {
	if (bnRoot) {bnRoot = bnDeleteNode(bnRoot);}
}
function bnDeleteNode(node) {
	node.b = null;
	node.box = null;
	// For each child
	for (var i=0;i<4;i++) {
		if (node.nodes[i]) { // If child exists
			node.nodes[i] = bnDeleteNode(node.nodes[i]);
		}
	}
	return null;
}

var bnRoot;
function bnBuildTree() {
	bnDeleteTree(bnRoot); // Delete Tree to clear memory
	bnRoot = {b: [], // Body
		leaf:true,
		CoM: null, // center of mass
		nodes:[null,null,null,null],
		// x y x2 y2
		box:[0, 0, canvasElement.width, canvasElement.height]};
	
	// Add each body to tree
	for (var i=0;i<bods.N;i++) {
		if (pointInBBOX(bods.pos.x[i],bods.pos.y[i],bnRoot.box)) {
			bnAddBody(bnRoot,i,0);
		}
		else {
			if (DEBUG>=4) {console.log("Body ",i," has left the BNtree area. Not added");}
		}
	}
	if (DEBUG>=2) {
		console.log("BNtree Built: ",bnRoot);
	}
	bnSetTreeStats(); // Update bn tree stats
}

// BBOX = [x y x2 y2]
function pointInBBOX(x,y,BBOX) {
	if (x >= BBOX[0] && x <= BBOX[2] && y >= BBOX[1] && y <= BBOX[3]) {return true;}
	else {return false;}
}

function bnAddBody(node,i,depth) {
	if (DEBUG>=3) {
		console.log("bnAddBody(",node,",",i,",",depth,")");
	}
	// if node has body already
	if ( node.b.length > 0 ) { // not empty
		// Check if hit max depth
		if (depth > MAXDEPTH) {
			if (DEBUG>=3) {console.log('MAX DEPTH B',i);}
			node.b [node.b.length] = i; // Add body to same node since already at max depth
		} 
		else {
			var subBodies;
			if (!node.leaf) { // Same as saying node.b = "PARENT"
				// Node is a parent with children
				subBodies = [i];
			} else {
				// Node is a leaf node (no children), turn to parent
				subBodies = [node.b,i];
			}
			for (var k=0;k<subBodies.length;k++) {
				// Add body to children too		
				var quad = getQuad(subBodies[k],node.box);
				var child = node.nodes[quad];
				if (child) {
					// if quad has child, recurse with child
					bnAddBody(child,subBodies[k],depth+1);
				} else {
					// else add body to child
					node = bnMakeNode(node,quad,subBodies[k]);
				}
			}
			node.b = ["PARENT"];
			node.leaf = false; // Always going to turn into a parent if not already
		}
		// Update center of mass
		node.CoM[1] = (node.CoM[1]*node.CoM[0] + bods.pos.x[i]*bods.mass[i])/(node.CoM[0]+bods.mass[i]);
		node.CoM[2] = (node.CoM[2]*node.CoM[0] + bods.pos.y[i]*bods.mass[i])/(node.CoM[0]+bods.mass[i]);
		node.CoM[0] += bods.mass[i];
	} else { // else if node empty, add body
		node.b = [i];
		node.CoM = [bods.mass[i], bods.pos.x[i],bods.pos.y[i]]; // Center of Mass set to the position of single body
	}
}

function getQuad(i,box) {
	var mx = (box[0]+box[2])/2;
	var my = (box[1]+box[3])/2;
	if (bods.pos.x[i] < mx) { // Left
		if (bods.pos.y[i] < my) {return 0;} // Top
		else {return 2;} // Bottom
	}
	else { // right
		if (bods.pos.y[i] < my) {return 1;} // Top
		else {return 3;} // Bottom}
	}
}

function bnMakeNode(parent,quad,child) {
	if (DEBUG>=3) {
		console.log("bnMakeNode(",parent,",",quad,",",child,")");
	}
	var child = {b:[child],
		leaf:true,
		CoM : [bods.mass[child], bods.pos.x[child],bods.pos.y[child]], // Center of Mass set to the position of single body
		nodes:[null,null,null,null],
		box:[0,0,0,0]};

	switch (quad) {
		case 0: // Top Left
			child.box = [parent.box[0],
				parent.box[1],
				(parent.box[0]+parent.box[2])/2, 
				(parent.box[1]+parent.box[3])/2];
			break;
		case 1: // Top Right
			child.box = [(parent.box[0]+parent.box[2])/2,
				parent.box[1],
				parent.box[2], 
				(parent.box[1]+parent.box[3])/2];
			break;
		case 2: // Bottom Left
			child.box = [parent.box[0],
				(parent.box[1]+parent.box[3])/2,
				(parent.box[0]+parent.box[2])/2, 
				parent.box[3]];
			break;
		case 3: // Bottom Right
			child.box = [(parent.box[0]+parent.box[2])/2,
				(parent.box[1]+parent.box[3])/2,
				parent.box[2], 
				parent.box[3]];
			break;
	}
	parent.nodes[quad] = child;
	return parent;
}

function doBNtree(bI) {
	doBNtreeRecurse(bI,bnRoot);
}
function doBNtreeRecurse(bI,node) {
	if (node.leaf) {
		// If node is a leaf node
		for (var k=0;k<node.b.length;k++) {
			if (bI != node.b[k]) { // Skip self
				setAccel(bI,node.b[k],false);
				numChecks += 1;
			}
		}
	}
	else {
		var s = Math.min( node.box[2]-node.box[0] , node.box[3]-node.box[1] ); // Biggest side of box
		var d = getDist(bods.pos.x[bI],bods.pos.y[bI],
			node.CoM[1],node.CoM[2]);
		if (s/d < BN_THETA) {
			setAccelDirect(bI,node.CoM[0],node.CoM[1],node.CoM[2])
			numChecks += 1;
		}
		else {
			// Recurse for each child
			for (var k=0;k<4;k++) {
				if (node.nodes[k]) {doBNtreeRecurse(bI,node.nodes[k]);}
			}
		}
	}
}

function getDist(x,y,x2,y2) {
	return Math.sqrt(Math.pow(x2-x,2)+Math.pow(y2-y,2));
}

// Update accelerations using BN tree
function forceBNtree() {
	bnBuildTree(); // Build BN tree based on current pos
	numChecks = 0;
	for (var i=0;i<bods.N;i++) {
		// For each body
		doBNtree(i);
	}
}
// ------
// do_Both defaults true: Updates acceleration of bods[j] also (negative of bods[i])

function setAccel(i,j,do_Both) {
	do_Both = typeof(do_Both) != 'undefined' ? do_Both : true;
	
	// Get Force Vector between bodies i, j
	var F = getForceVec(i,j);

	// a = F/m
	// Body i
	bods.acc.x[i] += F[0]/bods.mass[i];
	bods.acc.y[i] += F[1]/bods.mass[i];
	
	if (do_Both) {
		// Body j, equal and opposite force
		bods.acc.x[j] -= F[0]/bods.mass[j];
		bods.acc.y[j] -= F[1]/bods.mass[j];
	}
}
function setAccelDirect(i,m,x,y) {
	// Set's accel according to given mass

	// get Force Vector between body i
	// and a virtual mass
	//   with mass m, at position cx,cy
	var F = getForceVecDirect(
		bods.mass[i],bods.pos.x[i],bods.pos.y[i],
		m,x,y);
	
	// Update acceleration of body
	bods.acc.x[i] += F[0]/bods.mass[i];
	bods.acc.y[i] += F[1]/bods.mass[i];
}

function getForceVec(i,j) {
	if (DEBUG>=10) {
		console.log("B",i," <-> B",j," : ",F);
	}
	return getForceVecDirect(
		bods.mass[i],bods.pos.x[i],bods.pos.y[i],
		bods.mass[j],bods.pos.x[j],bods.pos.y[j]);
}

function getForceVecDirect(m,x,y,m2,x2,y2) {
	// Determines force interaction between
	// bods[i] and bods[j], an adds to bods[i]
	var dx = x2-x;
	var dy = y2-y;
	var r = Math.sqrt(dx*dx+dy*dy)+ETA;
	// F_{x|y} = d_{x|y}/r * G*M*m/r.^3;
	var F = G*m*m2/Math.pow(r,GFACTOR);

	return [ F*dx/r , F*dy/r ];
}


// Update accels by checking every body to each other
function forceBrute() {
	numChecks = 0;
	// Brute force O(n^2) comparisons
	for (var i=0;i<bods.N;i++) {
		for (var j=i+1;j<bods.N;j++) {
			setAccel(i,j);
			numChecks += 1;
		}
	}
}


var numChecks;
// Set accelerations of bodies based on gravity
function doForces() {
	// Zero accelerations
	for (var i=0;i<bods.N;i++) {
		bods.acc.x[i]=0;
		bods.acc.y[i]=0;
	}

	// Determine accelerations on all bodies
	switch (INTERACTION_METHOD) {
		case "BRUTE":
			forceBrute();
			break;
		case "BN":
			bnBuildTree(); // REMOVE WHEN doing forceBNtree!
			forceBNtree();
			break;
	}
	
	if (DEBUG>=2) {
		console.log("# Force Checks: ",numChecks);
	}
}

// Basic update system step by time step dt
var T = 0; // current system time
var dt = 0.01;
function step() {
	
	// Use integration method to step once by global dt
	leapfrog();

	T += dt;
	if (DEBUG>=2) {
	    console.log("STEP");
	}
	refreshGraphics();
}
function forwardEuler() {
	doForces(); // Set/Update accelerations
	updatePos(dt); // Move full step
	updateVel(dt); // Move Velocities full step
}

function leapfrog() {
	updatePos(0.5*dt); // Move half step
	doForces(); // Set/Update accelerations
	updateVel(dt); // Move Velocities full step
	updatePos(0.5*dt); // Move half step
}

function updatePos(dt_step) {
	// Update body positions based on velocities
	for (var i=0;i<bods.N;i++) {
		bods.pos.x[i] += bods.vel.x[i]*dt_step;
		bods.pos.y[i] += bods.vel.y[i]*dt_step;
	}
}
function updateVel(dt_step) {
	// Update body velocities based on accelerations
	for (var i=0;i<bods.N;i++) {
		bods.vel.x[i] += bods.acc.x[i]*dt_step;
		bods.vel.y[i] += bods.acc.y[i]*dt_step;
	}
}


var sysTimer;
var sysRunning = false;
function startSys() {
	sysTimer = setInterval(step,10);
	gfxTimer = setInterval(refreshGraphics,1/60.0*1000);
	sysRunning = true;
	if (DEBUG) {
	    console.log("START SYSTEM ",T,"s");
	}
}
function pauseSys() {
	clearInterval(sysTimer);
	clearInterval(gfxTimer);
	sysRunning = false;
	if (DEBUG) {
	    console.log("STOP SYSTEM ",T,"s");
	}
}