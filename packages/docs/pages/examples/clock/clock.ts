export default `
.clock {
  background: #fff;
  border: 10px solid #7a7a7a;
  border-radius: 50%;
  box-sizing: border-box;
  height: 300px;
  margin: 0 auto;
  position: relative;
  width: 300px;
}
.twelve,
.three,
.six,
.nine {
  background: #333;
  position: absolute;
}

.twelve,
.six {
  height: 10px;
  width: 4px;
}

.three,
.nine {
  height: 4px;
  width: 10px;
}

.twelve {
  left: 50%;
  top: -1px;
}

.three {
  right: -1px;
  top: 50%;
}

.six {
  left: 50%;
  bottom: -1px;
}

.nine {
  left: -1px;
  top: 50%;
}

.hour {
  height: 120px;
  width: 4px;
  background: #333;
  position: absolute;
  left: 50%;
  top: 20px;
  animation: tick 43200s infinite linear;
  -webkit-animation: tick 43200s infinite linear;
}

.minute {
  height: 100px;
  width: 4px;
  background: #777;
  position: absolute;
  left: 50%;
  top: 40px;
  animation: tick 3600s infinite linear;
  -webkit-animation: tick 3600s infinite linear;
}

.second {
  height: 60px;
  width: 4px;
  background: #fc0505;
  position: absolute;
  left: 50%;
  top: 80px;
  animation: tick 60s infinite linear;
  -webkit-animation: tick 60s infinite linear;
}

.hour,
.minute,
.second {
  transform-origin: 2px 100%;
  -webkit-transform-origin: 2px 100%;
}
`;
