import*as THREE from"three";function createSky(scene,sunLight){const geo=new THREE.SphereGeometry(400,64,64);const mat=new THREE.ShaderMaterial({side:THREE.BackSide,depthWrite:false,uniforms:{uTop:{value:new THREE.Color(5925530)},uMid:{value:new THREE.Color(15772270)},uHorizon:{value:new THREE.Color(14067833)},uSunDir:{value:sunLight.position.clone().normalize()},uSunColor:{value:sunLight.color.clone()}},vertexShader:`
      varying vec3 vPos;
      void main() {
        vPos = position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,fragmentShader:`
      varying vec3 vPos;
      uniform vec3 uTop, uMid, uHorizon, uSunDir, uSunColor;
      void main() {
        vec3 dir = normalize(vPos);
        float h = dir.y;
        
        
        
        
        
        
        vec3 col = mix(uHorizon, uMid, smoothstep(-0.35, 0.30, h));
        col = mix(col, uTop, smoothstep(0.25, 0.90, h));

        float sunDot = max(dot(dir, uSunDir), 0.0);
        
        
        
        
        
        
        
        
        
        
        float core = smoothstep(0.999700, 0.999900, sunDot) * 0.7;
        float halo = pow(sunDot, 90.0) * 0.022 + pow(sunDot, 400.0) * 0.13;
        col += uSunColor * (halo + core);

        gl_FragColor = vec4(col, 1.0);
      }
    `});const mesh=new THREE.Mesh(geo,mat);mesh.renderOrder=-1e3;scene.add(mesh);mat.userData.mesh=mesh;return mat}function updateSky(mat,top,mid,horizon,camPos){mat.uniforms.uTop.value.copy(top);mat.uniforms.uMid.value.copy(mid);mat.uniforms.uHorizon.value.copy(horizon);mat.userData.mesh.position.copy(camPos)}export{createSky,updateSky};
