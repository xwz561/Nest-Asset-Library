function inspectorBounds(base,workArea,desiredWidth=350){
  const available=Math.max(0,workArea.width-base.width),added=Math.min(desiredWidth,available);
  let x=base.x,width=base.width+added;
  const right=workArea.x+workArea.width;
  if(x+width>right)x=Math.max(workArea.x,right-width);
  return {x,y:base.y,width,height:base.height,added};
}
module.exports={inspectorBounds};
